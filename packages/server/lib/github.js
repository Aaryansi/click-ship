/**
 * GitHub API Helpers for Click-Ship
 *
 * Provides GitHub Content API access for cloud-native operations.
 * Uses GitHub App authentication instead of OAuth for better permissions.
 */

import { App } from '@octokit/app';
import { Octokit } from '@octokit/rest';

// GitHub App configuration
const githubApp = process.env.GITHUB_APP_ID ? new App({
  appId: process.env.GITHUB_APP_ID,
  privateKey: process.env.GITHUB_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  webhooks: {
    secret: process.env.GITHUB_WEBHOOK_SECRET || 'development'
  }
}) : null;

/**
 * Get Octokit instance for a specific installation
 */
export async function getInstallationOctokit(installationId) {
  if (!githubApp) {
    throw new Error('GitHub App not configured');
  }
  return githubApp.getInstallationOctokit(installationId);
}

/**
 * Get Octokit instance using user's OAuth token
 */
export function getUserOctokit(accessToken) {
  return new Octokit({ auth: accessToken });
}

// ============================================
// File Operations
// ============================================

/**
 * Get file content from a repository
 */
export async function getFileContent(octokit, owner, repo, path, ref = 'main') {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref
    });

    if (Array.isArray(data)) {
      throw new Error(`Path ${path} is a directory, not a file`);
    }

    if (data.type !== 'file') {
      throw new Error(`Path ${path} is not a file`);
    }

    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
      path: data.path,
      size: data.size
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get directory listing
 */
export async function getDirectoryContents(octokit, owner, repo, path = '', ref = 'main') {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref
    });

    if (!Array.isArray(data)) {
      throw new Error(`Path ${path} is not a directory`);
    }

    return data.map(item => ({
      name: item.name,
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: item.size
    }));
  } catch (error) {
    if (error.status === 404) {
      return [];
    }
    throw error;
  }
}

/**
 * Search for files matching a pattern
 */
export async function searchFiles(octokit, owner, repo, pattern, extensions = ['.tsx', '.jsx', '.js', '.html', '.css']) {
  const results = [];

  // Build query with extension filters
  const extensionQuery = extensions.map(ext => `extension:${ext.replace('.', '')}`).join(' ');
  const query = `${pattern} repo:${owner}/${repo} ${extensionQuery}`;

  try {
    const { data } = await octokit.rest.search.code({
      q: query,
      per_page: 20
    });

    for (const item of data.items) {
      results.push({
        path: item.path,
        name: item.name,
        sha: item.sha,
        htmlUrl: item.html_url
      });
    }
  } catch (error) {
    // Code search may fail due to rate limits or indexing
    console.warn('Code search failed, falling back to tree traversal:', error.message);
    return searchFilesViaTree(octokit, owner, repo, pattern, extensions);
  }

  return results;
}

/**
 * Search files by traversing the repository tree (fallback)
 */
async function searchFilesViaTree(octokit, owner, repo, pattern, extensions) {
  const results = [];

  try {
    // Get the full tree
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: 'heads/main'
    });

    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: refData.object.sha,
      recursive: 'true'
    });

    // Filter files by extension and search pattern
    const patternLower = pattern.toLowerCase();

    for (const item of tree.tree) {
      if (item.type !== 'blob') continue;

      const hasMatchingExt = extensions.some(ext => item.path.endsWith(ext));
      if (!hasMatchingExt) continue;

      // For simple patterns, just include all matching extension files
      // The actual content search happens later
      if (item.path.includes('src/') || item.path.includes('components/') || item.path.includes('app/')) {
        results.push({
          path: item.path,
          name: item.path.split('/').pop(),
          sha: item.sha
        });
      }
    }
  } catch (error) {
    console.error('Tree search failed:', error.message);
  }

  return results;
}

// ============================================
// Branch & Commit Operations
// ============================================

/**
 * Create a new branch from base
 */
export async function createBranch(octokit, owner, repo, newBranch, baseBranch = 'main') {
  // Get base branch SHA
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`
  });

  // Create new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha: refData.object.sha
  });

  return { sha: refData.object.sha };
}

/**
 * Update file content and create commit
 */
export async function updateFileAndCommit(octokit, owner, repo, {
  path,
  content,
  message,
  branch,
  sha
}) {
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    branch,
    sha
  });

  return {
    commitSha: data.commit.sha,
    contentSha: data.content.sha
  };
}

/**
 * Create branch, update file, and create PR in one flow
 */
export async function createBranchAndCommit(octokit, owner, repo, {
  baseBranch = 'main',
  newBranch,
  filePath,
  content,
  commitMessage,
  prTitle,
  prBody
}) {
  // 1. Get base branch SHA
  const { data: baseRef } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`
  });

  // 2. Create new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${newBranch}`,
    sha: baseRef.object.sha
  });

  // 3. Get current file SHA
  const { data: currentFile } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: baseBranch
  });

  // 4. Update file on new branch
  const { data: commitData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: Buffer.from(content).toString('base64'),
    branch: newBranch,
    sha: currentFile.sha
  });

  // 5. Create PR
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo,
    title: prTitle,
    body: prBody,
    head: newBranch,
    base: baseBranch
  });

  return {
    branch: newBranch,
    commitSha: commitData.commit.sha,
    prNumber: pr.number,
    prUrl: pr.html_url
  };
}

// ============================================
// Pull Request Operations
// ============================================

/**
 * Create a pull request
 */
export async function createPullRequest(octokit, owner, repo, {
  title,
  body,
  head,
  base = 'main'
}) {
  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base
  });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state
  };
}

/**
 * Get pull request details
 */
export async function getPullRequest(octokit, owner, repo, prNumber) {
  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    merged: data.merged,
    url: data.html_url,
    head: data.head.ref,
    base: data.base.ref
  };
}

/**
 * Merge a pull request
 */
export async function mergePullRequest(octokit, owner, repo, prNumber, mergeMethod = 'squash') {
  const { data } = await octokit.rest.pulls.merge({
    owner,
    repo,
    pull_number: prNumber,
    merge_method: mergeMethod
  });

  return {
    merged: data.merged,
    sha: data.sha,
    message: data.message
  };
}

/**
 * Close a pull request and delete its branch
 */
export async function closePullRequest(octokit, owner, repo, prNumber) {
  // Get PR to find branch name
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber
  });

  // Close PR
  await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: prNumber,
    state: 'closed'
  });

  // Delete branch
  try {
    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${pr.head.ref}`
    });
  } catch (error) {
    console.warn('Could not delete branch:', error.message);
  }

  return { closed: true, branch: pr.head.ref };
}

// ============================================
// Repository & User Info
// ============================================

/**
 * Get repository information
 */
export async function getRepositoryInfo(octokit, owner, repo) {
  const { data } = await octokit.rest.repos.get({
    owner,
    repo
  });

  return {
    id: data.id,
    name: data.name,
    fullName: data.full_name,
    owner: data.owner.login,
    defaultBranch: data.default_branch,
    private: data.private,
    description: data.description,
    language: data.language,
    htmlUrl: data.html_url
  };
}

/**
 * Check user's permission level on a repository
 */
export async function getUserPermission(octokit, owner, repo, username) {
  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username
    });

    return {
      permission: data.permission,
      canWrite: ['admin', 'maintain', 'write'].includes(data.permission)
    };
  } catch (error) {
    if (error.status === 404) {
      return { permission: 'none', canWrite: false };
    }
    throw error;
  }
}

/**
 * Get authenticated user info
 */
export async function getAuthenticatedUser(octokit) {
  const { data } = await octokit.rest.users.getAuthenticated();

  return {
    id: data.id,
    login: data.login,
    name: data.name,
    email: data.email,
    avatarUrl: data.avatar_url
  };
}

/**
 * List repositories accessible to the installation
 */
export async function listInstallationRepositories(octokit) {
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: 100
  });

  return data.repositories.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    owner: repo.owner.login,
    private: repo.private,
    defaultBranch: repo.default_branch
  }));
}

// ============================================
// GitHub App Webhooks
// ============================================

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload, signature) {
  if (!githubApp) return false;
  return githubApp.webhooks.verify(payload, signature);
}

/**
 * Process GitHub webhook event
 */
export async function processWebhookEvent(event, payload) {
  const eventName = event;
  const action = payload.action;

  // Handle different webhook events
  switch (eventName) {
    case 'installation':
      return handleInstallationEvent(action, payload);
    case 'pull_request':
      return handlePullRequestEvent(action, payload);
    case 'push':
      return handlePushEvent(payload);
    default:
      return { handled: false };
  }
}

async function handleInstallationEvent(action, payload) {
  const installationId = payload.installation.id;
  const account = payload.installation.account;

  switch (action) {
    case 'created':
      // New installation - will be handled by OAuth callback
      console.log(`New installation: ${installationId} for ${account.login}`);
      return { handled: true, action: 'installation_created' };
    case 'deleted':
      // Installation removed - clean up
      console.log(`Installation deleted: ${installationId}`);
      return { handled: true, action: 'installation_deleted' };
    default:
      return { handled: false };
  }
}

async function handlePullRequestEvent(action, payload) {
  const pr = payload.pull_request;
  const repo = payload.repository;

  // Only handle PRs created by Click-Ship
  if (!pr.head.ref.startsWith('click-ship/')) {
    return { handled: false };
  }

  switch (action) {
    case 'closed':
      if (pr.merged) {
        return { handled: true, action: 'pr_merged', prNumber: pr.number };
      } else {
        return { handled: true, action: 'pr_closed', prNumber: pr.number };
      }
    default:
      return { handled: false };
  }
}

async function handlePushEvent(payload) {
  // Could be used to trigger design token re-extraction
  return { handled: false };
}

export default {
  getInstallationOctokit,
  getUserOctokit,
  getFileContent,
  getDirectoryContents,
  searchFiles,
  createBranch,
  updateFileAndCommit,
  createBranchAndCommit,
  createPullRequest,
  getPullRequest,
  mergePullRequest,
  closePullRequest,
  getRepositoryInfo,
  getUserPermission,
  getAuthenticatedUser,
  listInstallationRepositories,
  verifyWebhookSignature,
  processWebhookEvent
};
