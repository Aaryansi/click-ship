/**
 * Supabase Client for Click-Ship
 *
 * Provides database access for the cloud-native backend.
 * Uses service role for backend operations (bypasses RLS).
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Warning: Supabase credentials not configured. Database features disabled.');
}

// Service role client (bypasses RLS for backend operations)
export const supabase = createClient(supabaseUrl || '', supabaseServiceKey || '', {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// ============================================
// User Operations
// ============================================

/**
 * Find or create user from GitHub data
 */
export async function upsertUser(githubUser) {
  const { data, error } = await supabase
    .from('users')
    .upsert({
      github_id: githubUser.id,
      github_login: githubUser.login,
      email: githubUser.email,
      name: githubUser.name,
      avatar_url: githubUser.avatar_url
    }, {
      onConflict: 'github_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user by GitHub ID
 */
export async function getUserByGitHubId(githubId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('github_id', githubId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get user by internal ID
 */
export async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// Organization Operations
// ============================================

/**
 * Create a new organization
 */
export async function createOrganization({ name, slug, ownerId, githubInstallationId = null }) {
  // Create org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({
      name,
      slug,
      github_installation_id: githubInstallationId
    })
    .select()
    .single();

  if (orgError) throw orgError;

  // Add owner membership
  const { error: memberError } = await supabase
    .from('org_memberships')
    .insert({
      org_id: org.id,
      user_id: ownerId,
      role: 'owner'
    });

  if (memberError) throw memberError;

  return org;
}

/**
 * Get organizations for a user
 */
export async function getUserOrganizations(userId) {
  const { data, error } = await supabase
    .from('org_memberships')
    .select(`
      role,
      organizations (*)
    `)
    .eq('user_id', userId);

  if (error) throw error;
  return data.map(m => ({ ...m.organizations, role: m.role }));
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get organization by GitHub installation ID
 */
export async function getOrganizationByInstallationId(installationId) {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('github_installation_id', installationId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Update organization settings
 */
export async function updateOrganization(orgId, updates) {
  const { data, error } = await supabase
    .from('organizations')
    .update(updates)
    .eq('id', orgId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// Repository Operations
// ============================================

/**
 * Add a repository to an organization
 */
export async function addRepository({ orgId, githubRepoId, owner, name, defaultBranch = 'main' }) {
  const { data, error } = await supabase
    .from('repositories')
    .upsert({
      org_id: orgId,
      github_repo_id: githubRepoId,
      owner,
      name,
      default_branch: defaultBranch
    }, {
      onConflict: 'org_id,github_repo_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get repositories for an organization
 */
export async function getOrganizationRepositories(orgId) {
  const { data, error } = await supabase
    .from('repositories')
    .select('*')
    .eq('org_id', orgId)
    .order('name');

  if (error) throw error;
  return data;
}

/**
 * Get repository by ID
 */
export async function getRepository(repoId) {
  const { data, error } = await supabase
    .from('repositories')
    .select(`
      *,
      organizations (*)
    `)
    .eq('id', repoId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get repository by GitHub repo ID within an org
 */
export async function getRepositoryByGitHubId(orgId, githubRepoId) {
  const { data, error } = await supabase
    .from('repositories')
    .select('*')
    .eq('org_id', orgId)
    .eq('github_repo_id', githubRepoId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Update repository design tokens
 */
export async function updateRepositoryDesignTokens(repoId, designTokens) {
  const { data, error } = await supabase
    .from('repositories')
    .update({ design_tokens: designTokens })
    .eq('id', repoId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// Edit Operations
// ============================================

/**
 * Create an edit record
 */
export async function createEdit(editData) {
  const { data, error } = await supabase
    .from('edits')
    .insert(editData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update edit with PR info
 */
export async function updateEditPR(editId, prData) {
  const { data, error } = await supabase
    .from('edits')
    .update({
      pr_number: prData.prNumber,
      pr_url: prData.prUrl,
      pr_status: prData.prStatus || 'open',
      branch_name: prData.branchName,
      commit_sha: prData.commitSha
    })
    .eq('id', editId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update edit PR status
 */
export async function updateEditStatus(editId, status) {
  const { data, error } = await supabase
    .from('edits')
    .update({ pr_status: status })
    .eq('id', editId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get edits for a repository
 */
export async function getRepositoryEdits(repoId, options = {}) {
  let query = supabase
    .from('edits')
    .select(`
      *,
      users (github_login, avatar_url)
    `)
    .eq('repo_id', repoId)
    .order('created_at', { ascending: false });

  if (options.status) {
    query = query.eq('pr_status', options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}

/**
 * Get edit by PR number
 */
export async function getEditByPRNumber(repoId, prNumber) {
  const { data, error } = await supabase
    .from('edits')
    .select('*')
    .eq('repo_id', repoId)
    .eq('pr_number', prNumber)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ============================================
// Annotation Operations
// ============================================

/**
 * Create an annotation
 */
export async function createAnnotation(annotationData) {
  const { data, error } = await supabase
    .from('annotations')
    .insert(annotationData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get annotations for a page
 */
export async function getPageAnnotations(repoId, pageUrl) {
  const { data, error } = await supabase
    .from('annotations')
    .select(`
      *,
      users (github_login, avatar_url)
    `)
    .eq('repo_id', repoId)
    .eq('page_url', pageUrl)
    .in('status', ['pending', 'in_progress'])
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Update annotation status
 */
export async function updateAnnotationStatus(annotationId, status, editId = null) {
  const updates = { status };
  if (editId) updates.edit_id = editId;

  const { data, error } = await supabase
    .from('annotations')
    .update(updates)
    .eq('id', annotationId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// Session Operations
// ============================================

import crypto from 'crypto';

/**
 * Create a session for a user
 */
export async function createSession(userId, githubToken, expiresInHours = 24 * 7) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  // Encrypt GitHub token (simplified - use proper encryption in production)
  const encryptedGithubToken = Buffer.from(githubToken).toString('base64');

  const { error } = await supabase
    .from('sessions')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      github_token_encrypted: encryptedGithubToken,
      expires_at: expiresAt
    });

  if (error) throw error;
  return { token, expiresAt };
}

/**
 * Validate session token and get user
 */
export async function validateSession(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const { data: session, error } = await supabase
    .from('sessions')
    .select(`
      *,
      users (*)
    `)
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) return null;

  // Update last used
  await supabase
    .from('sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id);

  // Decrypt GitHub token
  const githubToken = Buffer.from(session.github_token_encrypted, 'base64').toString();

  return {
    user: session.users,
    githubToken,
    sessionId: session.id
  };
}

/**
 * Delete session (logout)
 */
export async function deleteSession(token) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('token_hash', tokenHash);

  if (error) throw error;
}

/**
 * Clean up expired sessions
 */
export async function cleanupExpiredSessions() {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', new Date().toISOString());

  if (error) throw error;
}

// ============================================
// Audit Log Operations
// ============================================

/**
 * Log an audit event
 */
export async function logAuditEvent({ orgId, userId, action, resourceType, resourceId, metadata, ipAddress, userAgent }) {
  const { error } = await supabase
    .from('audit_log')
    .insert({
      org_id: orgId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      metadata,
      ip_address: ipAddress,
      user_agent: userAgent
    });

  if (error) console.error('Audit log error:', error);
}

export default supabase;
