/**
 * Click-Ship Extension - Background Service Worker
 *
 * Handles authentication, API communication, and message routing.
 */

import { API_URL, GITHUB_CLIENT_ID, MESSAGE_TYPES, ERRORS } from '../shared/constants.js';
import * as storage from '../shared/storage.js';
import * as auth from './auth.js';
import * as api from './api.js';

// ============================================
// Message Handling
// ============================================

/**
 * Handle messages from content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(error => sendResponse({ error: error.message }));

  // Return true to indicate async response
  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    // Authentication
    case MESSAGE_TYPES.AUTH_REQUEST:
      return auth.initiateAuth();

    case MESSAGE_TYPES.AUTH_STATUS:
      return auth.getAuthStatus();

    case MESSAGE_TYPES.LOGOUT:
      return auth.logout();

    // Edits
    case MESSAGE_TYPES.SUBMIT_EDIT:
      return api.submitEdit(payload);

    case MESSAGE_TYPES.GET_EDIT_HISTORY:
      return storage.getEditHistory();

    // PR Actions
    case MESSAGE_TYPES.CLOSE_PR:
      return api.closePR(payload);

    case MESSAGE_TYPES.MERGE_PR:
      return api.mergePR(payload);

    case MESSAGE_TYPES.PR_STATUS:
      return api.getPRStatus(payload);

    // Annotations
    case MESSAGE_TYPES.CREATE_ANNOTATION:
      return api.createAnnotation(payload);

    case MESSAGE_TYPES.GET_ANNOTATIONS:
      return storage.getAnnotations(payload.url);

    case MESSAGE_TYPES.UPDATE_ANNOTATION:
      return storage.updateAnnotation(payload.url, payload.id, payload.updates);

    // Preview
    case MESSAGE_TYPES.GET_PREVIEW:
      return api.getPreview(payload);

    default:
      console.warn('Unknown message type:', type);
      return { error: 'Unknown message type' };
  }
}

// ============================================
// OAuth Callback Handling
// ============================================

/**
 * Handle OAuth callback via chrome.identity
 */
chrome.identity.onSignInChanged?.addListener(async (account, signedIn) => {
  if (!signedIn) {
    await storage.clearAuth();
  }
});

// ============================================
// Installation & Updates
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Click-Ship extension installed');

    // Set default preferences
    storage.updatePreferences({
      theme: 'system',
      showTooltips: true,
      autoClose: true
    });
  }

  if (details.reason === 'update') {
    console.log('Click-Ship extension updated to version', chrome.runtime.getManifest().version);
  }
});

// ============================================
// Context Menu
// ============================================

// Create context menu item for right-click editing
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'clickship-edit',
    title: 'Edit with Click-Ship',
    contexts: ['all']
  });

  chrome.contextMenus.create({
    id: 'clickship-annotate',
    title: 'Add Click-Ship Annotation',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'clickship-edit') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_EDIT',
      x: info.pageX,
      y: info.pageY
    });
  }

  if (info.menuItemId === 'clickship-annotate') {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_MENU_ANNOTATE',
      x: info.pageX,
      y: info.pageY
    });
  }
});

// ============================================
// Badge Updates
// ============================================

/**
 * Update extension badge with pending PR count
 */
async function updateBadge() {
  const history = await storage.getEditHistory();
  const openPRs = history.filter(e => e.prStatus === 'open');

  if (openPRs.length > 0) {
    chrome.action.setBadgeText({ text: String(openPRs.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#18a0fb' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Update badge periodically
setInterval(updateBadge, 60000);
updateBadge();

// ============================================
// Keyboard Shortcuts
// ============================================

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: `COMMAND_${command.toUpperCase()}` });
    }
  });
});

console.log('Click-Ship background service worker initialized');
