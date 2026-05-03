/**
 * Click-Ship Extension - Storage Wrapper
 *
 * Provides a consistent interface for Chrome storage operations.
 */

import { STORAGE_KEYS } from './constants.js';

// ============================================
// Core Storage Operations
// ============================================

/**
 * Get value from storage
 */
export async function get(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(result[key] ?? null);
    });
  });
}

/**
 * Get multiple values from storage
 */
export async function getMultiple(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
}

/**
 * Set value in storage
 */
export async function set(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

/**
 * Set multiple values in storage
 */
export async function setMultiple(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, resolve);
  });
}

/**
 * Remove value from storage
 */
export async function remove(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(key, resolve);
  });
}

/**
 * Clear all storage
 */
export async function clear() {
  return new Promise((resolve) => {
    chrome.storage.local.clear(resolve);
  });
}

// ============================================
// Authentication Storage
// ============================================

/**
 * Get authentication data
 */
export async function getAuth() {
  const [token, user] = await Promise.all([
    get(STORAGE_KEYS.AUTH_TOKEN),
    get(STORAGE_KEYS.USER_DATA)
  ]);

  if (!token || !user) {
    return null;
  }

  return { token, user };
}

/**
 * Set authentication data
 */
export async function setAuth(token, user) {
  await setMultiple({
    [STORAGE_KEYS.AUTH_TOKEN]: token,
    [STORAGE_KEYS.USER_DATA]: user
  });
}

/**
 * Clear authentication data
 */
export async function clearAuth() {
  await remove(STORAGE_KEYS.AUTH_TOKEN);
  await remove(STORAGE_KEYS.USER_DATA);
  await remove(STORAGE_KEYS.GITHUB_TOKEN);
}

/**
 * Get GitHub token
 */
export async function getGitHubToken() {
  return get(STORAGE_KEYS.GITHUB_TOKEN);
}

/**
 * Set GitHub token
 */
export async function setGitHubToken(token) {
  return set(STORAGE_KEYS.GITHUB_TOKEN, token);
}

// ============================================
// Edit History Storage
// ============================================

/**
 * Get edit history
 */
export async function getEditHistory() {
  const history = await get(STORAGE_KEYS.EDIT_HISTORY);
  return history || [];
}

/**
 * Add edit to history
 */
export async function addEditToHistory(edit) {
  const history = await getEditHistory();

  // Add to beginning
  history.unshift({
    ...edit,
    timestamp: Date.now()
  });

  // Keep only last 100 edits
  if (history.length > 100) {
    history.pop();
  }

  await set(STORAGE_KEYS.EDIT_HISTORY, history);
  return history;
}

/**
 * Update edit in history
 */
export async function updateEditInHistory(editId, updates) {
  const history = await getEditHistory();
  const index = history.findIndex(e => e.id === editId || e.prNumber === editId);

  if (index !== -1) {
    history[index] = { ...history[index], ...updates };
    await set(STORAGE_KEYS.EDIT_HISTORY, history);
  }

  return history;
}

/**
 * Remove edit from history
 */
export async function removeEditFromHistory(editId) {
  const history = await getEditHistory();
  const filtered = history.filter(e => e.id !== editId && e.prNumber !== editId);
  await set(STORAGE_KEYS.EDIT_HISTORY, filtered);
  return filtered;
}

/**
 * Clear edit history
 */
export async function clearEditHistory() {
  await set(STORAGE_KEYS.EDIT_HISTORY, []);
}

// ============================================
// Annotations Storage
// ============================================

/**
 * Get annotations for a URL
 */
export async function getAnnotations(url) {
  const allAnnotations = await get(STORAGE_KEYS.ANNOTATIONS) || {};
  return allAnnotations[url] || [];
}

/**
 * Add annotation
 */
export async function addAnnotation(url, annotation) {
  const allAnnotations = await get(STORAGE_KEYS.ANNOTATIONS) || {};

  if (!allAnnotations[url]) {
    allAnnotations[url] = [];
  }

  allAnnotations[url].push({
    ...annotation,
    id: `ann_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now()
  });

  await set(STORAGE_KEYS.ANNOTATIONS, allAnnotations);
  return allAnnotations[url];
}

/**
 * Update annotation
 */
export async function updateAnnotation(url, annotationId, updates) {
  const allAnnotations = await get(STORAGE_KEYS.ANNOTATIONS) || {};

  if (!allAnnotations[url]) return null;

  const index = allAnnotations[url].findIndex(a => a.id === annotationId);
  if (index === -1) return null;

  allAnnotations[url][index] = {
    ...allAnnotations[url][index],
    ...updates,
    updatedAt: Date.now()
  };

  await set(STORAGE_KEYS.ANNOTATIONS, allAnnotations);
  return allAnnotations[url][index];
}

/**
 * Remove annotation
 */
export async function removeAnnotation(url, annotationId) {
  const allAnnotations = await get(STORAGE_KEYS.ANNOTATIONS) || {};

  if (!allAnnotations[url]) return [];

  allAnnotations[url] = allAnnotations[url].filter(a => a.id !== annotationId);
  await set(STORAGE_KEYS.ANNOTATIONS, allAnnotations);
  return allAnnotations[url];
}

// ============================================
// Preferences Storage
// ============================================

/**
 * Get user preferences
 */
export async function getPreferences() {
  const prefs = await get(STORAGE_KEYS.PREFERENCES);
  return {
    theme: 'system',
    showTooltips: true,
    autoClose: true,
    defaultSelector: 'class',
    ...prefs
  };
}

/**
 * Update user preferences
 */
export async function updatePreferences(updates) {
  const prefs = await getPreferences();
  const newPrefs = { ...prefs, ...updates };
  await set(STORAGE_KEYS.PREFERENCES, newPrefs);
  return newPrefs;
}

export default {
  get,
  getMultiple,
  set,
  setMultiple,
  remove,
  clear,
  getAuth,
  setAuth,
  clearAuth,
  getGitHubToken,
  setGitHubToken,
  getEditHistory,
  addEditToHistory,
  updateEditInHistory,
  removeEditFromHistory,
  clearEditHistory,
  getAnnotations,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  getPreferences,
  updatePreferences
};
