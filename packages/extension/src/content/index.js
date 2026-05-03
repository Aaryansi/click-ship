/**
 * Click-Ship Extension - Content Script Entry Point
 *
 * Initializes the Click-Ship UI on web pages.
 */

import { MESSAGE_TYPES, UI, ERRORS } from '../shared/constants.js';
import { initModal, showModal, hideModal } from './modal.js';
import { initSidebar, showHistorySidebar, showAnnotationsSidebar } from './sidebar.js';
import { initPreview, applyPreview, resetPreview } from './preview.js';
import { injectStyles } from './styles.js';
import { generateSelector, highlightElement, removeHighlight } from './utils.js';

// ============================================
// State
// ============================================

let isInitialized = false;
let isEnabled = true;
let selectedElement = null;
let authStatus = { authenticated: false, user: null };

// ============================================
// Initialization
// ============================================

async function init() {
  if (isInitialized) return;
  isInitialized = true;

  console.log('[Click-Ship] Initializing...');

  // Inject styles
  injectStyles();

  // Initialize UI components
  initModal();
  initSidebar();
  initPreview();

  // Check auth status
  authStatus = await sendMessage(MESSAGE_TYPES.AUTH_STATUS);

  // Set up event listeners
  setupEventListeners();

  // Listen for messages from background
  chrome.runtime.onMessage.addListener(handleBackgroundMessage);

  console.log('[Click-Ship] Initialized', { authenticated: authStatus.authenticated });
}

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Click handler for element selection
  document.addEventListener('click', handleClick, true);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyDown);

  // Mouse move for hover highlighting
  document.addEventListener('mousemove', handleMouseMove);

  // Handle escape to cancel
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape') {
      hideModal();
      removeHighlight();
      selectedElement = null;
    }
  });
}

/**
 * Handle click events
 */
function handleClick(e) {
  if (!isEnabled) return;

  // Ignore clicks on Click-Ship UI
  if (e.target.closest('[data-clickship-ui]')) return;

  // Check for modifier key (Alt/Option)
  if (!e.altKey) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;

  // Skip if element is in excluded list
  if (shouldSkipElement(element)) return;

  selectedElement = element;
  const selector = generateSelector(element);

  // Show edit modal
  showModal({
    element,
    selector,
    authenticated: authStatus.authenticated,
    user: authStatus.user,
    onSubmit: handleEditSubmit,
    onCancel: handleEditCancel,
    onAuth: handleAuthRequest
  });
}

/**
 * Handle mouse move for hover highlighting
 */
function handleMouseMove(e) {
  if (!isEnabled) return;

  // Only highlight when Alt key is pressed
  if (!e.altKey) {
    removeHighlight();
    return;
  }

  // Ignore Click-Ship UI elements
  if (e.target.closest('[data-clickship-ui]')) {
    removeHighlight();
    return;
  }

  highlightElement(e.target);
}

/**
 * Handle keyboard shortcuts
 */
function handleKeyDown(e) {
  // Cmd/Ctrl + Shift + E - Open edit mode
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'E') {
    e.preventDefault();
    isEnabled = !isEnabled;
    showToast(isEnabled ? 'Click-Ship enabled' : 'Click-Ship disabled');
  }

  // Cmd/Ctrl + Shift + H - Show history
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
    e.preventDefault();
    showHistorySidebar();
  }

  // Cmd/Ctrl + Shift + A - Show annotations
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    showAnnotationsSidebar();
  }
}

// ============================================
// Message Handling
// ============================================

/**
 * Send message to background script
 */
function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

/**
 * Handle messages from background script
 */
function handleBackgroundMessage(message, sender, sendResponse) {
  const { type, payload } = message;

  switch (type) {
    case 'CONTEXT_MENU_EDIT':
      handleContextMenuEdit(payload);
      break;

    case 'CONTEXT_MENU_ANNOTATE':
      handleContextMenuAnnotate(payload);
      break;

    case 'COMMAND_TOGGLE':
      isEnabled = !isEnabled;
      showToast(isEnabled ? 'Click-Ship enabled' : 'Click-Ship disabled');
      break;

    case 'AUTH_UPDATED':
      authStatus = payload;
      break;
  }
}

// ============================================
// Edit Handling
// ============================================

/**
 * Handle edit submission
 */
async function handleEditSubmit({ selector, desiredChange }) {
  const hostname = window.location.hostname;
  const pageUrl = window.location.href;

  showToast('Submitting edit...', 'loading');

  try {
    const result = await sendMessage(MESSAGE_TYPES.SUBMIT_EDIT, {
      hostname,
      selector,
      desiredChange,
      pageUrl
    });

    if (result.ok) {
      hideModal();
      showToast(`PR created! #${result.prNumber}`, 'success', result.prUrl);

      // Apply preview if available
      if (result.modifiedLine) {
        applyPreview(selectedElement, result.modifiedLine);
      }
    } else {
      showToast(result.error || ERRORS.EDIT_FAILED, 'error');
    }
  } catch (error) {
    showToast(error.message || ERRORS.NETWORK_ERROR, 'error');
  }
}

/**
 * Handle edit cancellation
 */
function handleEditCancel() {
  hideModal();
  removeHighlight();
  selectedElement = null;
}

/**
 * Handle auth request from modal
 */
async function handleAuthRequest() {
  const result = await sendMessage(MESSAGE_TYPES.AUTH_REQUEST);

  if (result.success) {
    authStatus = { authenticated: true, user: result.user };
    showToast(`Signed in as ${result.user.login}`, 'success');
  } else {
    showToast('Authentication failed', 'error');
  }

  return result;
}

// ============================================
// Context Menu Handling
// ============================================

function handleContextMenuEdit({ x, y }) {
  const element = document.elementFromPoint(x, y);
  if (!element) return;

  selectedElement = element;
  const selector = generateSelector(element);

  showModal({
    element,
    selector,
    authenticated: authStatus.authenticated,
    user: authStatus.user,
    onSubmit: handleEditSubmit,
    onCancel: handleEditCancel,
    onAuth: handleAuthRequest
  });
}

function handleContextMenuAnnotate({ x, y }) {
  const element = document.elementFromPoint(x, y);
  if (!element) return;

  // TODO: Show annotation modal
  console.log('Annotate element:', element);
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'info', actionUrl = null) {
  // Remove existing toast
  const existing = document.querySelector('[data-clickship-toast]');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.setAttribute('data-clickship-ui', 'true');
  toast.setAttribute('data-clickship-toast', 'true');
  toast.className = `clickship-toast clickship-toast-${type}`;

  let html = `<span class="clickship-toast-message">${message}</span>`;

  if (actionUrl) {
    html += `<a href="${actionUrl}" target="_blank" class="clickship-toast-action">View PR</a>`;
  }

  toast.innerHTML = html;
  document.body.appendChild(toast);

  // Auto remove
  if (type !== 'loading') {
    setTimeout(() => toast.remove(), UI.TOAST_DURATION);
  }

  return toast;
}

// ============================================
// Helpers
// ============================================

function shouldSkipElement(element) {
  const skipTags = ['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META'];
  return skipTags.includes(element.tagName);
}

// ============================================
// Initialize on Load
// ============================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
