/**
 * Click-Ship Extension - Authentication Module
 */

import { API_URL, GITHUB_CLIENT_ID, STORAGE_KEYS } from '../shared/constants.js';
import * as storage from '../shared/storage.js';

// ============================================
// OAuth Flow
// ============================================

/**
 * Initiate GitHub OAuth flow
 */
export async function initiateAuth() {
  const redirectUri = chrome.identity.getRedirectURL('oauth2');
  const state = generateState();

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', GITHUB_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'repo read:user user:email');
  authUrl.searchParams.set('state', state);

  try {
    const responseUrl = await launchWebAuthFlow(authUrl.toString());
    const params = new URL(responseUrl).searchParams;

    const code = params.get('code');
    const returnedState = params.get('state');

    // Verify state
    if (returnedState !== state) {
      throw new Error('OAuth state mismatch');
    }

    if (!code) {
      throw new Error('No authorization code received');
    }

    // Exchange code for token
    const result = await exchangeCode(code, redirectUri);

    // Store auth data
    await storage.setAuth(result.token, result.user);
    await storage.setGitHubToken(result.token);

    return {
      success: true,
      user: result.user
    };

  } catch (error) {
    console.error('Auth error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Launch Chrome's web auth flow
 */
function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url,
        interactive: true
      },
      (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!responseUrl) {
          reject(new Error('No response URL'));
        } else {
          resolve(responseUrl);
        }
      }
    );
  });
}

/**
 * Exchange OAuth code for access token
 */
async function exchangeCode(code, redirectUri) {
  const response = await fetch(`${API_URL}/auth/github`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ code, redirectUri })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Token exchange failed');
  }

  return response.json();
}

/**
 * Generate random state for OAuth
 */
function generateState() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// ============================================
// Auth Status
// ============================================

/**
 * Get current authentication status
 */
export async function getAuthStatus() {
  const auth = await storage.getAuth();

  if (!auth) {
    return {
      authenticated: false,
      user: null
    };
  }

  // Optionally validate token with server
  // For now, just return stored data
  return {
    authenticated: true,
    user: auth.user
  };
}

/**
 * Validate current token with server
 */
export async function validateToken() {
  const token = await storage.getGitHubToken();

  if (!token) {
    return false;
  }

  try {
    const response = await fetch(`${API_URL}/auth/validate`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    return response.ok;
  } catch {
    return false;
  }
}

// ============================================
// Logout
// ============================================

/**
 * Log out user
 */
export async function logout() {
  await storage.clearAuth();

  return {
    success: true
  };
}

export default {
  initiateAuth,
  getAuthStatus,
  validateToken,
  logout
};
