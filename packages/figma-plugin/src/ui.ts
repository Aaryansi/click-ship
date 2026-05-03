/**
 * Click-Ship Figma Plugin - UI Logic
 *
 * Runs in the plugin iframe. Handles user interactions and API communication.
 */

import { ClickShipAPI, AuthState, Repository, ExtractedStyles } from './api';

// ============================================
// State
// ============================================

let api: ClickShipAPI;
let authState: AuthState | null = null;
let currentSelection: ExtractedStyles | null = null;
let repositories: Repository[] = [];

// ============================================
// DOM Elements
// ============================================

const authSection = document.getElementById('auth-section') as HTMLElement;
const mainSection = document.getElementById('main-section') as HTMLElement;
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLElement;

const userInfo = document.getElementById('user-info') as HTMLElement;
const userAvatar = document.getElementById('user-avatar') as HTMLImageElement;
const userName = document.getElementById('user-name') as HTMLElement;

const noSelection = document.getElementById('no-selection') as HTMLElement;
const selectionInfo = document.getElementById('selection-info') as HTMLElement;
const elementName = document.getElementById('element-name') as HTMLElement;
const stylePreview = document.getElementById('style-preview') as HTMLElement;

const selectorInput = document.getElementById('selector-input') as HTMLInputElement;
const repoSelect = document.getElementById('repo-select') as HTMLSelectElement;
const descriptionInput = document.getElementById('description-input') as HTMLTextAreaElement;

const createPRBtn = document.getElementById('create-pr-btn') as HTMLButtonElement;
const statusContainer = document.getElementById('status-container') as HTMLElement;

// ============================================
// Initialization
// ============================================

function init() {
  api = new ClickShipAPI();

  // Check for stored auth
  const storedAuth = localStorage.getItem('clickship_auth');
  if (storedAuth) {
    try {
      authState = JSON.parse(storedAuth);
      api.setToken(authState!.token);
      showAuthenticatedUI();
      loadRepositories();
    } catch (e) {
      localStorage.removeItem('clickship_auth');
      showLoginUI();
    }
  } else {
    showLoginUI();
  }

  // Event listeners
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  createPRBtn.addEventListener('click', handleCreatePR);
  selectorInput.addEventListener('input', updateSubmitButton);
  repoSelect.addEventListener('change', updateSubmitButton);

  // Listen for messages from the plugin code
  window.onmessage = handlePluginMessage;
}

// ============================================
// UI State Management
// ============================================

function showLoginUI() {
  authSection.style.display = 'block';
  mainSection.style.display = 'none';
}

function showAuthenticatedUI() {
  authSection.style.display = 'none';
  mainSection.style.display = 'block';

  if (authState?.user) {
    userInfo.style.display = 'flex';
    userAvatar.src = authState.user.avatarUrl;
    userName.textContent = authState.user.login;
  }
}

function showStatus(message: string, type: 'success' | 'error' | 'loading') {
  statusContainer.innerHTML = `<div class="status ${type}">${message}</div>`;
}

function clearStatus() {
  statusContainer.innerHTML = '';
}

function updateSubmitButton() {
  const hasSelector = selectorInput.value.trim().length > 0;
  const hasRepo = repoSelect.value.length > 0;
  const hasSelection = currentSelection !== null;

  createPRBtn.disabled = !(hasSelector && hasRepo && hasSelection);
}

// ============================================
// Authentication
// ============================================

async function handleLogin() {
  // Open auth URL in browser
  const authUrl = api.getAuthUrl();
  window.open(authUrl, '_blank');

  // Show waiting message
  showStatus('Complete authentication in browser...', 'loading');

  // Poll for auth completion
  pollForAuth();
}

async function pollForAuth() {
  // In a real implementation, this would use a more sophisticated approach
  // like listening for a postMessage from the auth callback
  // For now, we'll use localStorage polling

  const checkInterval = setInterval(async () => {
    const storedAuth = localStorage.getItem('clickship_auth');
    if (storedAuth) {
      clearInterval(checkInterval);
      try {
        authState = JSON.parse(storedAuth);
        api.setToken(authState!.token);
        showAuthenticatedUI();
        clearStatus();
        loadRepositories();
      } catch (e) {
        showStatus('Authentication failed', 'error');
      }
    }
  }, 1000);

  // Stop polling after 5 minutes
  setTimeout(() => {
    clearInterval(checkInterval);
    if (!authState) {
      showStatus('Authentication timed out', 'error');
    }
  }, 5 * 60 * 1000);
}

function handleLogout() {
  localStorage.removeItem('clickship_auth');
  authState = null;
  api.setToken(null);
  showLoginUI();
  notify('Disconnected from Click-Ship');
}

// ============================================
// Repository Management
// ============================================

async function loadRepositories() {
  try {
    repositories = await api.getRepositories();

    repoSelect.innerHTML = '<option value="">Select a repository...</option>';

    repositories.forEach(repo => {
      const option = document.createElement('option');
      option.value = repo.id;
      option.textContent = `${repo.orgName} / ${repo.name}`;
      repoSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Failed to load repositories:', error);
    showStatus('Failed to load repositories', 'error');
  }
}

// ============================================
// Selection Handling
// ============================================

function handlePluginMessage(event: MessageEvent) {
  const msg = event.data.pluginMessage;
  if (!msg) return;

  switch (msg.type) {
    case 'selection':
      handleSelection(msg);
      break;

    case 'user':
      // Handle Figma user info if needed
      break;
  }
}

function handleSelection(msg: any) {
  if (!msg.hasSelection || !msg.styles) {
    currentSelection = null;
    noSelection.style.display = 'block';
    selectionInfo.style.display = 'none';
    updateSubmitButton();
    return;
  }

  currentSelection = msg.styles;
  noSelection.style.display = 'none';
  selectionInfo.style.display = 'block';

  elementName.textContent = `${msg.nodeName} (${msg.nodeType})`;
  renderStylePreview(msg.styles);
  updateSubmitButton();
}

function renderStylePreview(styles: ExtractedStyles) {
  stylePreview.innerHTML = '';

  // Background
  if (styles.fills && styles.fills.length > 0) {
    const fill = styles.fills.find((f: any) => f.type === 'SOLID');
    if (fill) {
      const color = rgbToHex(fill.color);
      addStyleItem('Background', `<span class="color-preview" style="background:${color}"></span>${color}`);
    }
  }

  // Border
  if (styles.strokes && styles.strokes.length > 0) {
    const stroke = styles.strokes[0];
    if (stroke.type === 'SOLID') {
      const color = rgbToHex(stroke.color);
      addStyleItem('Border', `${styles.strokeWeight}px ${color}`);
    }
  }

  // Border Radius
  if (styles.cornerRadius && styles.cornerRadius !== 'mixed') {
    addStyleItem('Radius', `${styles.cornerRadius}px`);
  }

  // Size
  addStyleItem('Size', `${Math.round(styles.width)} × ${Math.round(styles.height)}`);

  // Padding
  if (styles.padding) {
    const { top, right, bottom, left } = styles.padding;
    addStyleItem('Padding', `${top} ${right} ${bottom} ${left}`);
  }

  // Gap
  if (styles.gap !== null && styles.gap !== undefined) {
    addStyleItem('Gap', `${styles.gap}px`);
  }
}

function addStyleItem(property: string, value: string) {
  const item = document.createElement('div');
  item.className = 'style-item';
  item.innerHTML = `
    <div class="property">${property}</div>
    <div class="value">${value}</div>
  `;
  stylePreview.appendChild(item);
}

// ============================================
// Create PR
// ============================================

async function handleCreatePR() {
  if (!currentSelection) {
    showStatus('Please select an element', 'error');
    return;
  }

  const repoId = repoSelect.value;
  const selector = selectorInput.value.trim();

  if (!repoId || !selector) {
    showStatus('Please fill in required fields', 'error');
    return;
  }

  createPRBtn.disabled = true;
  showStatus('Creating PR...', 'loading');

  try {
    const result = await api.createEdit({
      repoId,
      selector,
      figmaStyles: currentSelection,
      description: descriptionInput.value.trim() || undefined
    });

    showStatus(`PR #${result.prNumber} created successfully!`, 'success');
    notify(`PR created: ${result.prUrl}`);

    // Clear form
    selectorInput.value = '';
    descriptionInput.value = '';
    updateSubmitButton();

  } catch (error: any) {
    showStatus(error.message || 'Failed to create PR', 'error');
    notify('Failed to create PR', true);
  } finally {
    createPRBtn.disabled = false;
  }
}

// ============================================
// Helpers
// ============================================

function rgbToHex(color: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function notify(message: string, error = false) {
  parent.postMessage({
    pluginMessage: {
      type: 'notify',
      message,
      error
    }
  }, '*');
}

// ============================================
// Initialize
// ============================================

init();
