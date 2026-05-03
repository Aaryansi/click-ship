/**
 * Click-Ship Extension - Injected Styles
 */

export function injectStyles() {
  if (document.getElementById('clickship-styles')) return;

  const style = document.createElement('style');
  style.id = 'clickship-styles';
  style.textContent = `
    /* ============================================
       Click-Ship UI Container Reset
       ============================================ */
    [data-clickship-ui] {
      all: initial;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      box-sizing: border-box;
    }

    [data-clickship-ui] * {
      box-sizing: border-box;
    }

    /* ============================================
       Highlight Overlay
       ============================================ */
    .clickship-highlight-overlay {
      pointer-events: none !important;
      border: 2px dashed #18a0fb !important;
      border-radius: 4px !important;
      z-index: 2147483646 !important;
    }

    /* ============================================
       Toast Notifications
       ============================================ */
    .clickship-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      background: #333;
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 2147483647;
      animation: clickship-toast-in 0.3s ease;
    }

    .clickship-toast-success {
      background: #1bc47d;
    }

    .clickship-toast-error {
      background: #f24822;
    }

    .clickship-toast-loading {
      background: #18a0fb;
    }

    .clickship-toast-loading::before {
      content: '';
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: #fff;
      border-radius: 50%;
      animation: clickship-spin 0.8s linear infinite;
    }

    .clickship-toast-action {
      color: inherit;
      text-decoration: underline;
      opacity: 0.9;
    }

    .clickship-toast-action:hover {
      opacity: 1;
    }

    @keyframes clickship-toast-in {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes clickship-spin {
      to {
        transform: rotate(360deg);
      }
    }

    /* ============================================
       Modal
       ============================================ */
    .clickship-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 2147483640;
      animation: clickship-fade-in 0.2s ease;
    }

    .clickship-modal {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      max-width: 90vw;
      max-height: 80vh;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
      z-index: 2147483641;
      animation: clickship-modal-in 0.2s ease;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .clickship-modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .clickship-modal-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .clickship-modal-close {
      width: 32px;
      height: 32px;
      border: none;
      background: none;
      cursor: pointer;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
    }

    .clickship-modal-close:hover {
      background: #f0f0f0;
    }

    .clickship-modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .clickship-modal-footer {
      padding: 16px 20px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    @keyframes clickship-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes clickship-modal-in {
      from {
        opacity: 0;
        transform: translate(-50%, -50%) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    }

    /* ============================================
       Form Elements
       ============================================ */
    .clickship-form-group {
      margin-bottom: 16px;
    }

    .clickship-label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #666;
      margin-bottom: 6px;
    }

    .clickship-input,
    .clickship-textarea {
      width: 100%;
      padding: 10px 12px;
      font-size: 14px;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      background: #fff;
      color: #333;
      transition: border-color 0.2s;
    }

    .clickship-input:focus,
    .clickship-textarea:focus {
      outline: none;
      border-color: #18a0fb;
      box-shadow: 0 0 0 3px rgba(24, 160, 251, 0.1);
    }

    .clickship-textarea {
      resize: vertical;
      min-height: 80px;
    }

    .clickship-input-readonly {
      background: #f5f5f5;
      color: #666;
    }

    /* ============================================
       Buttons
       ============================================ */
    .clickship-btn {
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .clickship-btn-primary {
      background: #18a0fb;
      color: #fff;
    }

    .clickship-btn-primary:hover {
      background: #0d8ce6;
    }

    .clickship-btn-primary:disabled {
      background: #a0d4f7;
      cursor: not-allowed;
    }

    .clickship-btn-secondary {
      background: #f0f0f0;
      color: #333;
    }

    .clickship-btn-secondary:hover {
      background: #e0e0e0;
    }

    .clickship-btn-danger {
      background: #f24822;
      color: #fff;
    }

    .clickship-btn-danger:hover {
      background: #d93a17;
    }

    .clickship-btn-ghost {
      background: transparent;
      color: #18a0fb;
    }

    .clickship-btn-ghost:hover {
      background: rgba(24, 160, 251, 0.1);
    }

    .clickship-btn-full {
      width: 100%;
    }

    /* ============================================
       Sidebar
       ============================================ */
    .clickship-sidebar {
      position: fixed;
      top: 0;
      right: 0;
      width: 350px;
      max-width: 100vw;
      height: 100vh;
      background: #fff;
      box-shadow: -4px 0 20px rgba(0,0,0,0.1);
      z-index: 2147483642;
      display: flex;
      flex-direction: column;
      animation: clickship-sidebar-in 0.3s ease;
    }

    .clickship-sidebar-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .clickship-sidebar-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0;
    }

    .clickship-sidebar-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }

    @keyframes clickship-sidebar-in {
      from {
        transform: translateX(100%);
      }
      to {
        transform: translateX(0);
      }
    }

    /* ============================================
       History Item
       ============================================ */
    .clickship-history-item {
      padding: 12px;
      background: #f9f9f9;
      border-radius: 8px;
      margin-bottom: 12px;
    }

    .clickship-history-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .clickship-history-item-pr {
      font-weight: 500;
      color: #18a0fb;
      text-decoration: none;
    }

    .clickship-history-item-pr:hover {
      text-decoration: underline;
    }

    .clickship-history-item-status {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
    }

    .clickship-history-item-status-open {
      background: #e6f4ea;
      color: #1e8e3e;
    }

    .clickship-history-item-status-merged {
      background: #e8daef;
      color: #7b2cbf;
    }

    .clickship-history-item-status-closed {
      background: #fce8e6;
      color: #c5221f;
    }

    .clickship-history-item-description {
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }

    .clickship-history-item-meta {
      font-size: 11px;
      color: #999;
    }

    /* ============================================
       Element Info
       ============================================ */
    .clickship-element-info {
      padding: 12px;
      background: #f5f8fa;
      border-radius: 8px;
      margin-bottom: 16px;
      font-size: 12px;
    }

    .clickship-element-info-tag {
      display: inline-block;
      background: #e0e7ee;
      color: #333;
      padding: 2px 8px;
      border-radius: 4px;
      font-family: monospace;
    }

    .clickship-element-info-classes {
      margin-top: 8px;
      color: #666;
      font-family: monospace;
      word-break: break-all;
    }

    /* ============================================
       Preview Overlay
       ============================================ */
    .clickship-preview-overlay {
      position: fixed;
      bottom: 24px;
      left: 24px;
      padding: 12px 20px;
      background: #18a0fb;
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 2147483645;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .clickship-preview-overlay .clickship-btn {
      padding: 6px 12px;
      font-size: 12px;
    }

    /* ============================================
       Auth Section
       ============================================ */
    .clickship-auth-section {
      text-align: center;
      padding: 24px;
    }

    .clickship-auth-icon {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }

    .clickship-auth-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 8px;
    }

    .clickship-auth-description {
      font-size: 13px;
      color: #666;
      margin-bottom: 20px;
    }

    /* ============================================
       Dark Mode Support
       ============================================ */
    @media (prefers-color-scheme: dark) {
      .clickship-modal,
      .clickship-sidebar {
        background: #1e1e1e;
        color: #e0e0e0;
      }

      .clickship-modal-header,
      .clickship-modal-footer,
      .clickship-sidebar-header {
        border-color: #333;
      }

      .clickship-input,
      .clickship-textarea {
        background: #2d2d2d;
        border-color: #444;
        color: #e0e0e0;
      }

      .clickship-input:focus,
      .clickship-textarea:focus {
        border-color: #18a0fb;
      }

      .clickship-btn-secondary {
        background: #333;
        color: #e0e0e0;
      }

      .clickship-btn-secondary:hover {
        background: #444;
      }

      .clickship-element-info {
        background: #2d2d2d;
      }

      .clickship-element-info-tag {
        background: #3d3d3d;
        color: #e0e0e0;
      }

      .clickship-history-item {
        background: #2d2d2d;
      }
    }
  `;

  document.head.appendChild(style);
}

export function removeStyles() {
  const style = document.getElementById('clickship-styles');
  if (style) style.remove();
}

export default { injectStyles, removeStyles };
