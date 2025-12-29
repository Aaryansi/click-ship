// click-ship/packages/extension/auth.js
// GitHub OAuth authentication module (communicates with background script)

console.log('🔐 click-ship auth module loaded');

// Initiate GitHub OAuth flow via background script
async function loginWithGitHub() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'login' }, (response) => {
      if (response.success) {
        resolve(response.user);
      } else {
        reject(new Error(response.error));
      }
    });
  });
}

// Check if user is currently authenticated
async function getGitHubToken() {
  const result = await chrome.storage.local.get('githubToken');
  return result.githubToken || null;
}

// Get stored user information
async function getGitHubUser() {
  const result = await chrome.storage.local.get('githubUser');
  return result.githubUser || null;
}

// Check if user is authenticated
async function isAuthenticated() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'checkAuth' }, (response) => {
      resolve(response.authenticated);
    });
  });
}

// Logout and clear stored credentials
async function logout() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'logout' }, (response) => {
      console.log('🔓 Logged out');
      resolve(response.success);
    });
  });
}

// Export functions for use in other scripts
window.clickShipAuth = {
  loginWithGitHub,
  getGitHubToken,
  getGitHubUser,
  isAuthenticated,
  logout
};
