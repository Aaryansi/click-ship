/**
 * Click-Ship Extension - Live Preview Component
 */

import { createElement } from './utils.js';

// ============================================
// State
// ============================================

let previewOverlay = null;
let originalStyles = new Map();
let previewActive = false;

// ============================================
// Initialization
// ============================================

export function initPreview() {
  // Create preview controls overlay
  previewOverlay = createElement('div', {
    'data-clickship-ui': 'true',
    className: 'clickship-preview-overlay',
    style: { display: 'none' }
  }, [
    createElement('span', {}, ['Preview Mode']),
    createElement('button', {
      className: 'clickship-btn clickship-btn-secondary',
      onClick: resetPreview
    }, ['Reset']),
    createElement('button', {
      className: 'clickship-btn clickship-btn-primary',
      onClick: keepPreview
    }, ['Keep'])
  ]);

  document.body.appendChild(previewOverlay);
}

// ============================================
// Apply Preview
// ============================================

/**
 * Apply a preview change to an element
 */
export function applyPreview(element, changes) {
  if (!element) return;

  // Store original styles
  if (!originalStyles.has(element)) {
    originalStyles.set(element, {
      className: element.className,
      style: element.getAttribute('style') || ''
    });
  }

  // Parse and apply changes
  if (typeof changes === 'string') {
    // If changes is code snippet, try to extract styles
    const styleChanges = parseStyleChanges(changes);
    applyStyleChanges(element, styleChanges);
  } else if (typeof changes === 'object') {
    applyStyleChanges(element, changes);
  }

  // Show preview overlay
  showPreviewOverlay();
  previewActive = true;
}

/**
 * Apply style changes to element
 */
function applyStyleChanges(element, changes) {
  // Handle className additions
  if (changes.addClasses) {
    changes.addClasses.forEach(cls => element.classList.add(cls));
  }

  if (changes.removeClasses) {
    changes.removeClasses.forEach(cls => element.classList.remove(cls));
  }

  // Handle inline styles
  if (changes.styles) {
    Object.assign(element.style, changes.styles);
  }

  // Handle text content
  if (changes.textContent !== undefined) {
    element.textContent = changes.textContent;
  }
}

/**
 * Parse style changes from code snippet
 */
function parseStyleChanges(code) {
  const changes = {
    addClasses: [],
    styles: {}
  };

  // Look for Tailwind classes in className
  const classNameMatch = code.match(/className=["']([^"']+)["']/);
  if (classNameMatch) {
    const classes = classNameMatch[1].split(/\s+/);
    changes.addClasses = classes;
  }

  // Look for inline styles
  const styleMatch = code.match(/style=\{\{([^}]+)\}\}/);
  if (styleMatch) {
    const styleStr = styleMatch[1];
    const stylePairs = styleStr.match(/(\w+)\s*:\s*['"]?([^'",}]+)['"]?/g);

    if (stylePairs) {
      stylePairs.forEach(pair => {
        const [, key, value] = pair.match(/(\w+)\s*:\s*['"]?([^'",}]+)['"]?/) || [];
        if (key && value) {
          // Convert camelCase to kebab-case for CSS
          const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
          changes.styles[cssKey] = value.trim();
        }
      });
    }
  }

  return changes;
}

// ============================================
// Reset Preview
// ============================================

/**
 * Reset all previewed changes
 */
export function resetPreview() {
  originalStyles.forEach((original, element) => {
    // Restore original className
    element.className = original.className;

    // Restore original inline styles
    if (original.style) {
      element.setAttribute('style', original.style);
    } else {
      element.removeAttribute('style');
    }
  });

  originalStyles.clear();
  hidePreviewOverlay();
  previewActive = false;
}

/**
 * Keep preview changes (don't reset)
 */
function keepPreview() {
  originalStyles.clear();
  hidePreviewOverlay();
  previewActive = false;
}

// ============================================
// Preview Overlay
// ============================================

function showPreviewOverlay() {
  if (previewOverlay) {
    previewOverlay.style.display = 'flex';
  }
}

function hidePreviewOverlay() {
  if (previewOverlay) {
    previewOverlay.style.display = 'none';
  }
}

// ============================================
// Preview State
// ============================================

export function isPreviewActive() {
  return previewActive;
}

export function getPreviewedElements() {
  return Array.from(originalStyles.keys());
}

export default {
  initPreview,
  applyPreview,
  resetPreview,
  isPreviewActive,
  getPreviewedElements
};
