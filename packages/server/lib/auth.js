/**
 * Authentication & Authorization Module for Click-Ship
 *
 * Handles JWT session management, GitHub OAuth, and permission checks.
 */

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { getUserByGitHubId, upsertUser, createSession, validateSession, deleteSession } from './supabase.js';
import { getUserOctokit, getAuthenticatedUser, getUserPermission } from './github.js';

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// ============================================
// GitHub OAuth Flow
// ============================================

/**
 * Exchange GitHub OAuth code for access token
 */
export async function exchangeGitHubCode(code, redirectUri) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`GitHub OAuth error: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope
  };
}

/**
 * Complete OAuth flow and create session
 */
export async function completeOAuthFlow(code, redirectUri) {
  // 1. Exchange code for token
  const { accessToken } = await exchangeGitHubCode(code, redirectUri);

  // 2. Get GitHub user info
  const octokit = getUserOctokit(accessToken);
  const githubUser = await getAuthenticatedUser(octokit);

  // 3. Upsert user in database
  const user = await upsertUser({
    id: githubUser.id,
    login: githubUser.login,
    email: githubUser.email,
    name: githubUser.name,
    avatar_url: githubUser.avatarUrl
  });

  // 4. Create session with encrypted GitHub token
  const { token: sessionToken, expiresAt } = await createSession(user.id, accessToken);

  // 5. Generate JWT for client
  const jwtToken = generateJWT({
    userId: user.id,
    githubLogin: user.github_login,
    sessionToken
  });

  return {
    token: jwtToken,
    expiresAt,
    user: {
      id: user.id,
      login: user.github_login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatar_url
    }
  };
}

// ============================================
// JWT Token Management
// ============================================

/**
 * Generate JWT token
 */
export function generateJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode JWT token
 */
export function verifyJWT(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
}

// ============================================
// Request Authentication Middleware
// ============================================

/**
 * Authenticate request and attach user context
 * For use as Fastify preHandler hook
 */
export async function authenticateRequest(request, reply) {
  const token = extractBearerToken(request.headers.authorization);

  if (!token) {
    reply.code(401).send({ error: 'Missing authentication token' });
    return;
  }

  // Verify JWT
  const decoded = verifyJWT(token);
  if (!decoded) {
    reply.code(401).send({ error: 'Invalid or expired token' });
    return;
  }

  // Validate session
  const session = await validateSession(decoded.sessionToken);
  if (!session) {
    reply.code(401).send({ error: 'Session expired or invalid' });
    return;
  }

  // Attach context to request
  request.user = session.user;
  request.githubToken = session.githubToken;
  request.sessionId = session.sessionId;
}

/**
 * Optional authentication - doesn't fail if no token
 */
export async function optionalAuth(request, reply) {
  const token = extractBearerToken(request.headers.authorization);

  if (!token) {
    request.user = null;
    request.githubToken = null;
    return;
  }

  const decoded = verifyJWT(token);
  if (!decoded) {
    request.user = null;
    request.githubToken = null;
    return;
  }

  const session = await validateSession(decoded.sessionToken);
  if (session) {
    request.user = session.user;
    request.githubToken = session.githubToken;
    request.sessionId = session.sessionId;
  } else {
    request.user = null;
    request.githubToken = null;
  }
}

// ============================================
// Authorization Checks
// ============================================

/**
 * Check if user has write access to a repository
 */
export async function checkRepositoryAccess(githubToken, owner, repo, username) {
  const octokit = getUserOctokit(githubToken);
  const { canWrite } = await getUserPermission(octokit, owner, repo, username);
  return canWrite;
}

/**
 * Check if user is a member of an organization
 */
export async function checkOrganizationMembership(userId, orgId) {
  const { data, error } = await supabase
    .from('org_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', orgId)
    .single();

  if (error || !data) return null;
  return data.role;
}

/**
 * Authorization middleware for organization access
 */
export function requireOrgAccess(roles = ['owner', 'admin', 'member']) {
  return async (request, reply) => {
    const orgId = request.params.orgId;
    const userId = request.user?.id;

    if (!userId) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const role = await checkOrganizationMembership(userId, orgId);

    if (!role || !roles.includes(role)) {
      reply.code(403).send({ error: 'Insufficient permissions for this organization' });
      return;
    }

    request.orgRole = role;
  };
}

/**
 * Authorization middleware for repository access
 */
export async function requireRepoAccess(request, reply) {
  const { owner, repo } = request.params;
  const githubToken = request.githubToken;
  const username = request.user?.github_login;

  if (!githubToken || !username) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  const hasAccess = await checkRepositoryAccess(githubToken, owner, repo, username);

  if (!hasAccess) {
    reply.code(403).send({ error: 'No write access to this repository' });
    return;
  }
}

// ============================================
// Session Management
// ============================================

/**
 * Logout - invalidate session
 */
export async function logout(sessionToken) {
  await deleteSession(sessionToken);
}

/**
 * Get current user from request
 */
export function getCurrentUser(request) {
  return request.user || null;
}

/**
 * Get GitHub token from request
 */
export function getGitHubToken(request) {
  return request.githubToken || null;
}

// ============================================
// API Key Authentication (for integrations)
// ============================================

/**
 * Generate API key for organization
 */
export function generateAPIKey() {
  const prefix = 'cship_';
  const key = crypto.randomBytes(24).toString('hex');
  return `${prefix}${key}`;
}

/**
 * Hash API key for storage
 */
export function hashAPIKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Authenticate via API key (for webhooks, Slack, etc.)
 */
export async function authenticateAPIKey(apiKey) {
  const hash = hashAPIKey(apiKey);

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .contains('settings', { api_key_hash: hash })
    .single();

  if (error || !data) return null;
  return data;
}

export default {
  exchangeGitHubCode,
  completeOAuthFlow,
  generateJWT,
  verifyJWT,
  extractBearerToken,
  authenticateRequest,
  optionalAuth,
  checkRepositoryAccess,
  checkOrganizationMembership,
  requireOrgAccess,
  requireRepoAccess,
  logout,
  getCurrentUser,
  getGitHubToken,
  generateAPIKey,
  hashAPIKey,
  authenticateAPIKey
};
