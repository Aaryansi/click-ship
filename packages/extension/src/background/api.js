/**
 * Click-Ship Extension - API Communication
 */

import { API_URL, ERRORS } from '../shared/constants.js';
import * as storage from '../shared/storage.js';

// ============================================
// API Request Helper
// ============================================

/**
 * Make authenticated API request
 */
async function request(endpoint, options = {}) {
  const token = await storage.getGitHubToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `API error: ${response.status}`);
  }

  return data;
}

// ============================================
// Edit Operations
// ============================================

/**
 * Submit an edit request
 */
export async function submitEdit(payload) {
  const { hostname, selector, desiredChange, pageUrl } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  try {
    const result = await request('/edit', {
      method: 'POST',
      body: JSON.stringify({
        hostname,
        selector,
        desiredChange,
        pageUrl,
        githubToken: token
      })
    });

    // Add to history
    if (result.ok) {
      await storage.addEditToHistory({
        id: result.editId || `edit_${Date.now()}`,
        hostname,
        selector,
        desiredChange,
        file: result.file,
        branch: result.branch,
        prNumber: result.prNumber,
        prUrl: result.prUrl,
        prStatus: 'open'
      });
    }

    return result;

  } catch (error) {
    console.error('Submit edit error:', error);
    throw error;
  }
}

/**
 * Get preview of code change
 */
export async function getPreview(payload) {
  const { hostname, selector, desiredChange } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  return request('/edit/preview', {
    method: 'POST',
    body: JSON.stringify({
      hostname,
      selector,
      desiredChange,
      githubToken: token
    })
  });
}

// ============================================
// PR Operations
// ============================================

/**
 * Close a pull request
 */
export async function closePR(payload) {
  const { owner, repo, prNumber } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  const result = await request('/close-pr', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      repo,
      prNumber,
      githubToken: token
    })
  });

  // Update history
  await storage.updateEditInHistory(prNumber, { prStatus: 'closed' });

  return result;
}

/**
 * Merge a pull request
 */
export async function mergePR(payload) {
  const { owner, repo, prNumber } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  const result = await request('/merge-pr', {
    method: 'POST',
    body: JSON.stringify({
      owner,
      repo,
      prNumber,
      githubToken: token
    })
  });

  // Update history
  await storage.updateEditInHistory(prNumber, { prStatus: 'merged' });

  return result;
}

/**
 * Get PR status
 */
export async function getPRStatus(payload) {
  const { owner, repo, prNumber } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  return request(`/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: 'GET'
  });
}

// ============================================
// Annotation Operations
// ============================================

/**
 * Create a cloud annotation
 */
export async function createAnnotation(payload) {
  const { repoId, selector, pageUrl, noteText, positionData } = payload;

  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  return request('/annotations', {
    method: 'POST',
    body: JSON.stringify({
      repoId,
      selector,
      pageUrl,
      noteText,
      positionData
    })
  });
}

/**
 * Get annotations for a page (from cloud)
 */
export async function getCloudAnnotations(repoId, pageUrl) {
  const token = await storage.getGitHubToken();
  if (!token) {
    return [];
  }

  try {
    const result = await request(`/annotations?repoId=${repoId}&pageUrl=${encodeURIComponent(pageUrl)}`);
    return result.annotations || [];
  } catch (error) {
    console.error('Get annotations error:', error);
    return [];
  }
}

// ============================================
// Repository Operations
// ============================================

/**
 * Get user's repositories
 */
export async function getRepositories() {
  const token = await storage.getGitHubToken();
  if (!token) {
    throw new Error(ERRORS.NOT_AUTHENTICATED);
  }

  return request('/repos');
}

/**
 * Get repository by hostname
 */
export async function getRepositoryByHostname(hostname) {
  const token = await storage.getGitHubToken();
  if (!token) {
    return null;
  }

  try {
    const result = await request(`/repos/by-hostname?hostname=${encodeURIComponent(hostname)}`);
    return result.repo;
  } catch {
    return null;
  }
}

export default {
  submitEdit,
  getPreview,
  closePR,
  mergePR,
  getPRStatus,
  createAnnotation,
  getCloudAnnotations,
  getRepositories,
  getRepositoryByHostname
};
