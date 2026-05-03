/**
 * Click-Ship Extension - Modal Component
 */

import { createElement, escapeHtml, getElementInfo } from './utils.js';

// ============================================
// State
// ============================================

let modalContainer = null;
let currentOptions = null;

// ============================================
// Initialization
// ============================================

export function initModal() {
  // Create container if needed
  if (!modalContainer) {
    modalContainer = createElement('div', {
      'data-clickship-ui': 'true',
      id: 'clickship-modal-container'
    });
    document.body.appendChild(modalContainer);
  }
}

// ============================================
// Show/Hide Modal
// ============================================

export function showModal(options) {
  currentOptions = options;
  const { element, selector, authenticated, user, onSubmit, onCancel, onAuth } = options;

  const elementInfo = getElementInfo(element);

  // Clear previous content
  modalContainer.innerHTML = '';

  // Create backdrop
  const backdrop = createElement('div', {
    className: 'clickship-modal-backdrop',
    onClick: (e) => {
      if (e.target === backdrop) {
        hideModal();
        onCancel?.();
      }
    }
  });

  // Create modal
  const modal = createElement('div', { className: 'clickship-modal' }, [
    // Header
    createElement('div', { className: 'clickship-modal-header' }, [
      createElement('h2', { className: 'clickship-modal-title' }, ['Edit Element']),
      createElement('button', {
        className: 'clickship-modal-close',
        onClick: () => {
          hideModal();
          onCancel?.();
        }
      }, ['×'])
    ]),

    // Body
    createElement('div', { className: 'clickship-modal-body' }, [
      // Auth check
      !authenticated ? createAuthSection(onAuth) : null,

      // Element info
      createElement('div', { className: 'clickship-element-info' }, [
        createElement('span', { className: 'clickship-element-info-tag' }, [
          `<${elementInfo.tag}>`
        ]),
        elementInfo.classes.length > 0 ? createElement('div', {
          className: 'clickship-element-info-classes'
        }, [`.${elementInfo.classes.join('.')}`]) : null
      ]),

      // Selector input
      createElement('div', { className: 'clickship-form-group' }, [
        createElement('label', { className: 'clickship-label' }, ['CSS Selector']),
        createElement('input', {
          type: 'text',
          className: 'clickship-input clickship-input-readonly',
          id: 'clickship-selector',
          value: selector,
          readonly: 'true'
        })
      ]),

      // Change description
      createElement('div', { className: 'clickship-form-group' }, [
        createElement('label', { className: 'clickship-label' }, ['What would you like to change?']),
        createElement('textarea', {
          className: 'clickship-textarea',
          id: 'clickship-change',
          placeholder: 'e.g., "Make the text red" or "Add padding: 20px"'
        })
      ])
    ].filter(Boolean)),

    // Footer
    createElement('div', { className: 'clickship-modal-footer' }, [
      createElement('button', {
        className: 'clickship-btn clickship-btn-secondary',
        onClick: () => {
          hideModal();
          onCancel?.();
        }
      }, ['Cancel']),
      createElement('button', {
        className: 'clickship-btn clickship-btn-primary',
        id: 'clickship-submit',
        disabled: !authenticated,
        onClick: handleSubmit
      }, ['Create PR'])
    ])
  ]);

  modalContainer.appendChild(backdrop);
  modalContainer.appendChild(modal);

  // Focus the change input
  setTimeout(() => {
    const changeInput = document.getElementById('clickship-change');
    if (changeInput) changeInput.focus();
  }, 100);
}

export function hideModal() {
  if (modalContainer) {
    modalContainer.innerHTML = '';
  }
  currentOptions = null;
}

// ============================================
// Auth Section
// ============================================

function createAuthSection(onAuth) {
  return createElement('div', { className: 'clickship-auth-section' }, [
    createElement('div', { className: 'clickship-auth-icon' }, ['🔐']),
    createElement('h3', { className: 'clickship-auth-title' }, ['Sign in to continue']),
    createElement('p', { className: 'clickship-auth-description' }, [
      'Connect your GitHub account to create pull requests'
    ]),
    createElement('button', {
      className: 'clickship-btn clickship-btn-primary clickship-btn-full',
      onClick: async () => {
        const result = await onAuth();
        if (result.success) {
          // Refresh modal with auth
          showModal({
            ...currentOptions,
            authenticated: true,
            user: result.user
          });
        }
      }
    }, ['Sign in with GitHub'])
  ]);
}

// ============================================
// Submit Handler
// ============================================

async function handleSubmit() {
  if (!currentOptions) return;

  const selectorInput = document.getElementById('clickship-selector');
  const changeInput = document.getElementById('clickship-change');
  const submitBtn = document.getElementById('clickship-submit');

  const selector = selectorInput?.value?.trim();
  const desiredChange = changeInput?.value?.trim();

  if (!selector || !desiredChange) {
    // Show validation error
    if (changeInput && !desiredChange) {
      changeInput.style.borderColor = '#f24822';
      changeInput.focus();
    }
    return;
  }

  // Disable button and show loading
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating PR...';
  }

  try {
    await currentOptions.onSubmit({ selector, desiredChange });
  } catch (error) {
    // Re-enable button
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create PR';
    }
  }
}

export default {
  initModal,
  showModal,
  hideModal
};
