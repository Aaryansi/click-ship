/**
 * Click-Ship Extension - Utility Functions
 */

import { UI } from '../shared/constants.js';

// ============================================
// Selector Generation
// ============================================

/**
 * Generate a unique CSS selector for an element
 */
export function generateSelector(element) {
  // Try ID first
  if (element.id) {
    return `#${element.id}`;
  }

  // Try unique class
  if (element.classList.length > 0) {
    const classes = Array.from(element.classList)
      .filter(c => !c.startsWith('_') && !c.match(/^[a-z]{1,3}\d+/)) // Filter generated classes
      .join('.');

    if (classes) {
      const selector = `.${classes}`;
      if (isUniqueSelector(selector)) {
        return selector;
      }
    }
  }

  // Try data attributes
  for (const attr of element.attributes) {
    if (attr.name.startsWith('data-') && attr.name !== 'data-clickship-ui') {
      const selector = `[${attr.name}="${attr.value}"]`;
      if (isUniqueSelector(selector)) {
        return selector;
      }
    }
  }

  // Build path selector
  return buildPathSelector(element);
}

/**
 * Check if selector matches exactly one element
 */
function isUniqueSelector(selector) {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

/**
 * Build a path-based selector
 */
function buildPathSelector(element) {
  const path = [];
  let current = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }

    if (current.classList.length > 0) {
      const validClasses = Array.from(current.classList)
        .filter(c => !c.startsWith('_') && !c.match(/^[a-z]{1,3}\d+/));

      if (validClasses.length > 0) {
        selector += `.${validClasses[0]}`;
      }
    }

    // Add nth-child if needed
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        s => s.tagName === current.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}

/**
 * Get element info for display
 */
export function getElementInfo(element) {
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    classes: Array.from(element.classList),
    text: element.textContent?.slice(0, 50).trim() || null,
    computedStyles: getRelevantStyles(element)
  };
}

/**
 * Get relevant computed styles for an element
 */
function getRelevantStyles(element) {
  const computed = window.getComputedStyle(element);
  return {
    color: computed.color,
    backgroundColor: computed.backgroundColor,
    fontSize: computed.fontSize,
    fontWeight: computed.fontWeight,
    padding: computed.padding,
    margin: computed.margin,
    borderRadius: computed.borderRadius
  };
}

// ============================================
// Element Highlighting
// ============================================

let highlightOverlay = null;

/**
 * Highlight an element
 */
export function highlightElement(element) {
  if (!highlightOverlay) {
    highlightOverlay = document.createElement('div');
    highlightOverlay.setAttribute('data-clickship-ui', 'true');
    highlightOverlay.className = 'clickship-highlight-overlay';
    document.body.appendChild(highlightOverlay);
  }

  const rect = element.getBoundingClientRect();

  Object.assign(highlightOverlay.style, {
    display: 'block',
    position: 'fixed',
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    backgroundColor: UI.HIGHLIGHT_COLOR,
    opacity: UI.HIGHLIGHT_ALPHA,
    pointerEvents: 'none',
    zIndex: '2147483646',
    transition: 'all 0.1s ease'
  });
}

/**
 * Remove element highlight
 */
export function removeHighlight() {
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none';
  }
}

// ============================================
// DOM Helpers
// ============================================

/**
 * Create element with attributes
 */
export function createElement(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child) {
      element.appendChild(child);
    }
  }

  return element;
}

/**
 * Escape HTML
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Get element by selector safely
 */
export function $(selector, context = document) {
  try {
    return context.querySelector(selector);
  } catch {
    return null;
  }
}

/**
 * Get all elements by selector safely
 */
export function $$(selector, context = document) {
  try {
    return Array.from(context.querySelectorAll(selector));
  } catch {
    return [];
  }
}

export default {
  generateSelector,
  getElementInfo,
  highlightElement,
  removeHighlight,
  createElement,
  escapeHtml,
  $,
  $$
};
