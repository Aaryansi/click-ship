// click-ship/packages/extension/background.js

console.log('🚀 click-ship background loaded');

// GitHub OAuth configuration
const GITHUB_CLIENT_ID = 'Ov23liHllcCFZ0fZ9FJN';
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';

// Handle GitHub OAuth login
async function handleGitHubLogin() {
  try {
    console.log('🔑 Starting GitHub OAuth flow...');

    // Get the extension's redirect URL
    const redirectUri = chrome.identity.getRedirectURL('oauth2');
    console.log('Redirect URI:', redirectUri);

    // Build the authorization URL
    const authUrl = `${GITHUB_AUTH_URL}?client_id=${GITHUB_CLIENT_ID}&scope=repo,read:org&redirect_uri=${encodeURIComponent(redirectUri)}`;

    // Launch the OAuth flow in a popup
    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true
    });

    console.log('OAuth response URL:', responseUrl);

    // Extract the authorization code from the response URL
    const url = new URL(responseUrl);
    const code = url.searchParams.get('code');

    if (!code) {
      throw new Error('No authorization code received from GitHub');
    }

    // Exchange the code for an access token via our server
    const response = await fetch('http://localhost:3001/auth/github', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri })
    });

    console.log('Server response status:', response.status);

    // Get response as text first to see what we're dealing with
    const responseText = await response.text();
    console.log('Server response text:', responseText);

    if (!response.ok) {
      let errorMessage;
      try {
        const error = JSON.parse(responseText);
        errorMessage = error.error || 'Failed to exchange code for token';
      } catch (e) {
        errorMessage = `Server error: ${responseText.substring(0, 100)}`;
      }
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Server returned invalid JSON: ' + responseText.substring(0, 100));
    }

    const { token, user } = data;

    // Store the token and user info
    await chrome.storage.local.set({
      githubToken: token,
      githubUser: user
    });

    console.log('✅ Successfully authenticated as', user.login);

    return { success: true, user };

  } catch (error) {
    console.error('❌ GitHub OAuth failed:', error);
    return { success: false, error: error.message };
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('✉️ Message received in background', msg);

  // Handle login request
  if (msg.action === 'login') {
    handleGitHubLogin().then(result => {
      sendResponse(result);
    });
    return true; // Keep the message channel open for async response
  }

  // Handle logout request
  if (msg.action === 'logout') {
    chrome.storage.local.remove(['githubToken', 'githubUser'], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // Handle check auth request
  if (msg.action === 'checkAuth') {
    chrome.storage.local.get(['githubToken', 'githubUser'], (result) => {
      sendResponse({
        authenticated: !!result.githubToken,
        user: result.githubUser
      });
    });
    return true;
  }

  // Handle edit request
  if (msg.action === 'edit') {
    // Validate the message contains required fields
    if (!msg.hostname || !msg.selector || !msg.desiredChange) {
      console.error('⚠️ Invalid payload', msg);
      sendResponse({ error: 'Invalid payload' });
      return true;
    }

    // Validate GitHub token is present
    if (!msg.githubToken) {
      console.error('⚠️ No GitHub token provided');
      sendResponse({ error: 'Not authenticated. Please login with GitHub.' });
      return true;
    }

    // Send the message to the local server
    fetch('http://localhost:3001/edit', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        hostname: msg.hostname,
        selector: msg.selector,
        desiredChange: msg.desiredChange,
        githubToken: msg.githubToken
      })
    })
      .then(res => {
        if (!res.ok) {
          throw new Error(`Server responded with status ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        console.log('✅ Server response:', data);
        // Show a notification with the results
        if (data.ok) {
          // Notification is optional - content script shows its own notification
          console.log('✅ Change committed successfully');
        }
        sendResponse(data);
      })
      .catch(err => {
        console.error('⚠️ Server error:', err);
        sendResponse({ error: err.message });
      });

    // Return true to indicate we'll respond asynchronously
    return true;
  }

  // Unknown action
  sendResponse({ error: 'Unknown action' });
  return false;
});