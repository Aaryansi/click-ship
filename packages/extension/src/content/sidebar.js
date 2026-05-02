/**
 * Click-Ship Extension - Sidebar Component
 */

import { MESSAGE_TYPES } from '../shared/constants.js';
import { createElement, escapeHtml } from './utils.js';

// ============================================
// State
// ============================================

let sidebarContainer = null;
let currentView = null;

// ============================================
// Initialization
// ============================================

export function initSidebar() {
  if (!sidebarContainer) {
    sidebarContainer = createElement('div', {
      'data-clickship-ui': 'true',
      id: 'clickship-sidebar-container'
    });
    document.body.appendChild(sidebarContainer);
  }
}

// ============================================
// Show/Hide Sidebar
// ============================================

export async function showHistorySidebar() {
  currentView = 'history';

  // Get edit history
  const history = await sendMessage(MESSAGE_TYPES.GET_EDIT_HISTORY);

  renderSidebar({
    title: 'Edit History',
    content: renderHistoryList(history)
  });
}

export async function showAnnotationsSidebar() {
  currentView = 'annotations';

  // Get annotations for current page
  const annotations = await sendMessage(MESSAGE_TYPES.GET_ANNOTATIONS, {
    url: window.location.href
  });

  renderSidebar({
    title: 'Annotations',
    content: renderAnnotationsList(annotations)
  });
}

export function hideSidebar() {
  if (sidebarContainer) {
    sidebarContainer.innerHTML = '';
  }
  currentView = null;
}

// ============================================
// Render Sidebar
// ============================================

function renderSidebar({ title, content }) {
  sidebarContainer.innerHTML = '';

  const sidebar = createElement('div', { className: 'clickship-sidebar' }, [
    // Header
    createElement('div', { className: 'clickship-sidebar-header' }, [
      createElement('h2', { className: 'clickship-sidebar-title' }, [title]),
      createElement('button', {
        className: 'clickship-modal-close',
        onClick: hideSidebar
      }, ['×'])
    ]),

    // Body
    createElement('div', { className: 'clickship-sidebar-body' }, [content])
  ]);

  sidebarContainer.appendChild(sidebar);
}

// ============================================
// History List
// ============================================

function renderHistoryList(history) {
  if (!history || history.length === 0) {
    return createElement('div', {
      style: { textAlign: 'center', color: '#666', padding: '40px 20px' }
    }, ['No edits yet']);
  }

  const container = createElement('div', {});

  history.forEach(edit => {
    const item = createElement('div', { className: 'clickship-history-item' }, [
      // Header
      createElement('div', { className: 'clickship-history-item-header' }, [
        createElement('a', {
          className: 'clickship-history-item-pr',
          href: edit.prUrl,
          target: '_blank'
        }, [`PR #${edit.prNumber}`]),
        createElement('span', {
          className: `clickship-history-item-status clickship-history-item-status-${edit.prStatus || 'open'}`
        }, [edit.prStatus || 'open'])
      ]),

      // Description
      createElement('div', {
        className: 'clickship-history-item-description'
      }, [escapeHtml(edit.desiredChange || edit.description || '')]),

      // Meta
      createElement('div', { className: 'clickship-history-item-meta' }, [
        `${edit.file || edit.selector} • ${formatTime(edit.timestamp)}`
      ]),

      // Actions
      edit.prStatus === 'open' ? createElement('div', {
        style: { marginTop: '8px', display: 'flex', gap: '8px' }
      }, [
        createElement('button', {
          className: 'clickship-btn clickship-btn-ghost',
          style: { padding: '4px 8px', fontSize: '12px' },
          onClick: () => handleMergePR(edit)
        }, ['Merge']),
        createElement('button', {
          className: 'clickship-btn clickship-btn-ghost',
          style: { padding: '4px 8px', fontSize: '12px', color: '#f24822' },
          onClick: () => handleClosePR(edit)
        }, ['Close'])
      ]) : null
    ].filter(Boolean));

    container.appendChild(item);
  });

  return container;
}

// ============================================
// Annotations List
// ============================================

function renderAnnotationsList(annotations) {
  if (!annotations || annotations.length === 0) {
    return createElement('div', {}, [
      createElement('div', {
        style: { textAlign: 'center', color: '#666', padding: '40px 20px' }
      }, ['No annotations on this page']),

      createElement('button', {
        className: 'clickship-btn clickship-btn-primary clickship-btn-full',
        style: { marginTop: '20px' },
        onClick: startAnnotationMode
      }, ['Add Annotation'])
    ]);
  }

  const container = createElement('div', {});

  // Add button
  container.appendChild(createElement('button', {
    className: 'clickship-btn clickship-btn-primary clickship-btn-full',
    style: { marginBottom: '16px' },
    onClick: startAnnotationMode
  }, ['Add Annotation']));

  annotations.forEach(annotation => {
    const item = createElement('div', { className: 'clickship-history-item' }, [
      createElement('div', {
        className: 'clickship-history-item-description'
      }, [escapeHtml(annotation.noteText || annotation.note_text || '')]),

      createElement('div', { className: 'clickship-history-item-meta' }, [
        formatTime(annotation.createdAt || annotation.created_at)
      ]),

      createElement('div', {
        style: { marginTop: '8px', display: 'flex', gap: '8px' }
      }, [
        createElement('button', {
          className: 'clickship-btn clickship-btn-ghost',
          style: { padding: '4px 8px', fontSize: '12px' },
          onClick: () => handleConvertAnnotation(annotation)
        }, ['Create PR']),
        createElement('button', {
          className: 'clickship-btn clickship-btn-ghost',
          style: { padding: '4px 8px', fontSize: '12px', color: '#f24822' },
          onClick: () => handleDismissAnnotation(annotation)
        }, ['Dismiss'])
      ])
    ]);

    container.appendChild(item);
  });

  return container;
}

// ============================================
// Action Handlers
// ============================================

async function handleMergePR(edit) {
  if (!confirm('Are you sure you want to merge this PR?')) return;

  try {
    const result = await sendMessage(MESSAGE_TYPES.MERGE_PR, {
      owner: edit.owner,
      repo: edit.repo,
      prNumber: edit.prNumber
    });

    if (result.ok) {
      showHistorySidebar(); // Refresh
    }
  } catch (error) {
    alert('Failed to merge PR: ' + error.message);
  }
}

async function handleClosePR(edit) {
  if (!confirm('Are you sure you want to close this PR?')) return;

  try {
    const result = await sendMessage(MESSAGE_TYPES.CLOSE_PR, {
      owner: edit.owner,
      repo: edit.repo,
      prNumber: edit.prNumber
    });

    if (result.ok) {
      showHistorySidebar(); // Refresh
    }
  } catch (error) {
    alert('Failed to close PR: ' + error.message);
  }
}

function startAnnotationMode() {
  hideSidebar();
  // TODO: Enter annotation mode
  alert('Annotation mode coming soon!');
}

async function handleConvertAnnotation(annotation) {
  // TODO: Convert annotation to edit
  alert('Convert to PR coming soon!');
}

async function handleDismissAnnotation(annotation) {
  if (!confirm('Dismiss this annotation?')) return;

  await sendMessage(MESSAGE_TYPES.UPDATE_ANNOTATION, {
    url: window.location.href,
    id: annotation.id,
    updates: { status: 'dismissed' }
  });

  showAnnotationsSidebar(); // Refresh
}

// ============================================
// Helpers
// ============================================

function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, payload }, resolve);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than a minute
  if (diff < 60000) return 'Just now';

  // Less than an hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

  // Less than a day
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  // Less than a week
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

  // Format date
  return date.toLocaleDateString();
}

export default {
  initSidebar,
  showHistorySidebar,
  showAnnotationsSidebar,
  hideSidebar
};
