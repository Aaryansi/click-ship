/**
 * Click-Ship Extension - Shared Constants
 */

// API URL - production vs development
export const API_URL = (() => {
  // In production build, use cloud URL
  if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
    return 'https://api.click-ship.dev';
  }

  // In development, use localhost
  return 'http://localhost:8080';
})();

// GitHub OAuth
export const GITHUB_CLIENT_ID = 'Ov23liHllcCFZ0fZ9FJN';

// Extension Identifiers
export const EXTENSION_NAME = 'Click-Ship';
export const EXTENSION_VERSION = '2.0.0';

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'clickship_auth_token',
  USER_DATA: 'clickship_user_data',
  GITHUB_TOKEN: 'clickship_github_token',
  EDIT_HISTORY: 'clickship_edit_history',
  ANNOTATIONS: 'clickship_annotations',
  PREFERENCES: 'clickship_preferences'
};

// Message Types (background <-> content)
export const MESSAGE_TYPES = {
  // Auth
  AUTH_REQUEST: 'AUTH_REQUEST',
  AUTH_CALLBACK: 'AUTH_CALLBACK',
  AUTH_STATUS: 'AUTH_STATUS',
  LOGOUT: 'LOGOUT',

  // Edits
  SUBMIT_EDIT: 'SUBMIT_EDIT',
  EDIT_RESULT: 'EDIT_RESULT',
  GET_EDIT_HISTORY: 'GET_EDIT_HISTORY',

  // Annotations
  CREATE_ANNOTATION: 'CREATE_ANNOTATION',
  GET_ANNOTATIONS: 'GET_ANNOTATIONS',
  UPDATE_ANNOTATION: 'UPDATE_ANNOTATION',

  // PR Actions
  CLOSE_PR: 'CLOSE_PR',
  MERGE_PR: 'MERGE_PR',
  PR_STATUS: 'PR_STATUS',

  // Preview
  GET_PREVIEW: 'GET_PREVIEW',
  APPLY_PREVIEW: 'APPLY_PREVIEW',
  RESET_PREVIEW: 'RESET_PREVIEW'
};

// UI Constants
export const UI = {
  MODAL_WIDTH: 420,
  MODAL_HEIGHT: 500,
  SIDEBAR_WIDTH: 350,
  TOAST_DURATION: 4000,
  HIGHLIGHT_COLOR: '#18a0fb',
  HIGHLIGHT_ALPHA: 0.2
};

// Error Messages
export const ERRORS = {
  NOT_AUTHENTICATED: 'Please sign in with GitHub to use Click-Ship',
  NO_SELECTOR: 'Could not determine a selector for this element',
  INVALID_SELECTOR: 'The selector is invalid',
  EDIT_FAILED: 'Failed to create edit. Please try again.',
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You do not have permission to edit this repository'
};

export default {
  API_URL,
  GITHUB_CLIENT_ID,
  EXTENSION_NAME,
  EXTENSION_VERSION,
  STORAGE_KEYS,
  MESSAGE_TYPES,
  UI,
  ERRORS
};
