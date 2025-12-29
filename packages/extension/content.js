// click-ship/packages/extension/content.js

console.log('📄 click-ship content script loaded');

// Don't run on GitHub pages (to avoid interfering with OAuth)
if (!window.location.hostname.includes('github.com')) {

(() => {
  // 1) INJECT STYLES - Clean Minimal Design
  const css = `
    /* Base Reset for Click-Ship elements */
    .click-ship-backdrop,
    .click-ship-modal,
    .click-ship-modal * {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
    }

    /* Backdrop - subtle overlay */
    .click-ship-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.3);
      backdrop-filter: blur(2px);
      z-index: 2147483645;
      animation: cs-fade-in 0.15s ease-out;
    }

    @keyframes cs-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes cs-slide-up {
      from { opacity: 0; transform: translate(-50%, -48%); }
      to { opacity: 1; transform: translate(-50%, -50%); }
    }

    @keyframes cs-toast-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes cs-toast-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(-8px); }
    }

    /* Modal - clean white card */
    .click-ship-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: #ffffff;
      color: #1e293b;
      padding: 0;
      width: 90%;
      max-width: 420px;
      border-radius: 16px;
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.03),
        0 2px 4px rgba(0, 0, 0, 0.02),
        0 12px 24px rgba(0, 0, 0, 0.06),
        0 24px 48px rgba(0, 0, 0, 0.04);
      z-index: 2147483646;
      overflow: hidden;
      animation: cs-slide-up 0.2s ease-out;
    }

    .click-ship-modal.dragging {
      user-select: none;
      cursor: grabbing;
    }

    /* Header / Drag Handle */
    .click-ship-drag-handle {
      background: #f8fafc;
      padding: 16px 20px;
      cursor: grab;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e2e8f0;
      transition: background 0.15s ease;
    }

    .click-ship-drag-handle:hover {
      background: #f1f5f9;
    }

    .click-ship-drag-handle:active {
      cursor: grabbing;
    }

    .click-ship-drag-hint {
      font-size: 11px;
      color: #94a3b8;
      font-weight: 500;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    /* Modal Body */
    .click-ship-modal-body {
      padding: 20px 24px 24px;
    }

    /* Typography */
    .click-ship-modal h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #0f172a;
      letter-spacing: -0.2px;
    }

    .click-ship-modal p {
      font-size: 13px;
      margin: 0 0 16px;
      color: #64748b;
      overflow-wrap: anywhere;
    }

    .click-ship-modal code {
      background: #f1f5f9;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      color: #475569;
    }

    /* Textarea */
    .click-ship-modal textarea {
      width: 100%;
      height: 88px;
      padding: 12px 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      color: #1e293b;
      margin-bottom: 16px;
      font-size: 14px;
      resize: vertical;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .click-ship-modal textarea::placeholder {
      color: #94a3b8;
    }

    .click-ship-modal textarea:focus {
      outline: none;
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    /* Button Group */
    .click-ship-modal .button-group {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    /* Buttons */
    .click-ship-modal button {
      padding: 10px 18px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .click-ship-modal .btn-cancel {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
    }

    .click-ship-modal .btn-cancel:hover {
      background: #e2e8f0;
      border-color: #cbd5e1;
    }

    .click-ship-modal .btn-preview {
      background: #6366f1;
      color: white;
    }

    .click-ship-modal .btn-preview:hover {
      background: #4f46e5;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .click-ship-modal .btn-confirm {
      background: #10b981;
      color: white;
    }

    .click-ship-modal .btn-confirm:hover {
      background: #059669;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    /* Hover Overlay - subtle indicator */
    .click-ship-overlay {
      position: fixed;
      pointer-events: none;
      outline: 2px solid #6366f1;
      outline-offset: 2px;
      background: rgba(99, 102, 241, 0.08);
      border-radius: 4px;
      z-index: 2147483644;
      transition: all 0.1s ease-out;
    }

    /* User Info Section */
    .click-ship-user-info {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: #f8fafc;
      border-radius: 10px;
    }

    .click-ship-user-info img {
      border-radius: 50%;
      width: 36px;
      height: 36px;
      border: 2px solid #e2e8f0;
    }

    .click-ship-user-info .user-details {
      flex: 1;
    }

    .click-ship-user-info .user-name {
      font-weight: 600;
      color: #0f172a;
      font-size: 14px;
    }

    .click-ship-user-info .user-login {
      font-size: 12px;
      color: #64748b;
    }

    .click-ship-user-info .btn-logout {
      padding: 6px 12px;
      background: transparent;
      color: #64748b;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.15s ease;
    }

    .click-ship-user-info .btn-logout:hover {
      background: #f1f5f9;
      color: #475569;
      border-color: #cbd5e1;
    }

    /* Login Prompt */
    .click-ship-login-prompt {
      text-align: center;
      padding: 8px 0;
    }

    .click-ship-login-prompt p {
      color: #64748b;
      margin-bottom: 20px;
    }

    .click-ship-login-prompt .btn-login {
      background: #0f172a;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
    }

    .click-ship-login-prompt .btn-login:hover {
      background: #1e293b;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
    }

    /* GitHub icon for login button */
    .click-ship-login-prompt .btn-login::before {
      content: '';
      width: 18px;
      height: 18px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'%3E%3Cpath d='M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z'/%3E%3C/svg%3E");
      background-size: contain;
      background-repeat: no-repeat;
    }
  `;
  const styleTag = document.createElement('style');
  styleTag.textContent = css;
  document.head.append(styleTag);

  // 2) STATE
  let backdrop = null;
  let modal    = null;
  let selected = null;
  let original = {};

  // 3) HOVER OVERLAY
  let hoverOverlay = null;
  document.addEventListener('mousemove', e => {
    if (modal) return;
    const el = e.target;
    if (!el.id && el.classList.length===0) {
      if (hoverOverlay) hoverOverlay.remove();
      return;
    }
    if (hoverOverlay) hoverOverlay.remove();
    const r = el.getBoundingClientRect();
    hoverOverlay = document.createElement('div');
    hoverOverlay.className = 'click-ship-overlay';
    hoverOverlay.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px;`;
    document.body.append(hoverOverlay);
  });

  // 4) CLICK HANDLER -> OPEN MODAL (with auth check)
  document.addEventListener('click', async e => {
    if (modal) return;
    const el = e.target;
    if (el.closest('.click-ship-modal')) return;
    if (!el.id && el.classList.length===0) return;

    e.preventDefault();
    e.stopPropagation();

    selected = el;
    const selector = el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : '') +
      (el.classList.length ? `.${[...el.classList].join('.')}` : '');

    // Check authentication before opening editor
    const isAuth = await window.clickShipAuth.isAuthenticated();
    openEditor(selector, isAuth);
  }, true);

  // 5) DRAG FUNCTIONALITY
  function setupDrag(modalEl) {
    const handle = modalEl.querySelector('.click-ship-drag-handle');
    if (!handle) return;

    let isDragging = false;
    let startX, startY, initialX, initialY;

    handle.addEventListener('mousedown', (e) => {
      // Don't drag if clicking on buttons inside handle
      if (e.target.tagName === 'BUTTON') return;

      isDragging = true;
      modalEl.classList.add('dragging');

      // Get current position
      const rect = modalEl.getBoundingClientRect();

      // Remove transform and set absolute position
      modalEl.style.transform = 'none';
      modalEl.style.left = rect.left + 'px';
      modalEl.style.top = rect.top + 'px';

      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newX = initialX + dx;
      let newY = initialY + dy;

      // Keep modal within viewport bounds
      const rect = modalEl.getBoundingClientRect();
      newX = Math.max(0, Math.min(newX, window.innerWidth - rect.width));
      newY = Math.max(0, Math.min(newY, window.innerHeight - rect.height));

      modalEl.style.left = newX + 'px';
      modalEl.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        modalEl.classList.remove('dragging');
      }
    });
  }

  // 6) OPEN EDITOR UI
  async function openEditor(selector, isAuthenticated) {
    backdrop = document.createElement('div');
    backdrop.className = 'click-ship-backdrop';
    modal    = document.createElement('div');
    modal.className = 'click-ship-modal';

    if (!isAuthenticated) {
      // Show login prompt
      modal.innerHTML = `
        <div class="click-ship-drag-handle">
          <h2>Click-Ship</h2>
          <span class="click-ship-drag-hint">drag to move</span>
        </div>
        <div class="click-ship-modal-body">
          <div class="click-ship-login-prompt">
            <p>Sign in with GitHub to start making changes to this page</p>
            <button class="btn-login">Continue with GitHub</button>
          </div>
        </div>
      `;
      document.body.append(backdrop, modal);
      setupDrag(modal);

      modal.querySelector('.btn-login').onclick = async () => {
        try {
          closeEditor(); // Close modal before opening OAuth popup
          showNotification('Opening GitHub...');
          await window.clickShipAuth.loginWithGitHub();
          showNotification('Successfully signed in');
        } catch (error) {
          showNotification(`Sign in failed: ${error.message}`, true);
        }
      };

      backdrop.onclick = closeEditor;
      return;
    }

    // Get user info for display
    const user = await window.clickShipAuth.getGitHubUser();

    // Show authenticated editor
    modal.innerHTML = `
      <div class="click-ship-drag-handle">
        <h2>Click-Ship</h2>
        <span class="click-ship-drag-hint">drag to move</span>
      </div>
      <div class="click-ship-modal-body">
        <div class="click-ship-user-info">
          <img src="${user.avatar_url}" alt="${user.login}" />
          <div class="user-details">
            <div class="user-name">${user.name || user.login}</div>
            <div class="user-login">@${user.login}</div>
          </div>
          <button class="btn-logout">Sign out</button>
        </div>
        <textarea placeholder="Describe your change, e.g.&#10;padding: 24px&#10;text -> Hello World"></textarea>
        <div class="button-group">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-preview">Preview</button>
        </div>
      </div>
    `;
    document.body.append(backdrop, modal);
    setupDrag(modal);

    // Add event listeners
    modal.querySelector('.btn-logout').onclick = async () => {
      await window.clickShipAuth.logout();
      showNotification('Signed out');
      closeEditor();
    };

    modal.querySelector('.btn-cancel').onclick = closeEditor;
    modal.querySelector('.btn-preview').onclick = handlePreview;
  }

  // 6) CLOSE EDITOR & CLEANUP
  function closeEditor() {
    if (backdrop) backdrop.remove();
    if (modal) modal.remove();
    backdrop = modal = null;
    selected = null;
    if (hoverOverlay) hoverOverlay.remove();
  }

  // 7) PREVIEW LOGIC
  function handlePreview() {
    const textarea = modal.querySelector('textarea');
    const change   = textarea.value.trim();
    if (!change) {
      alert('Please describe your change before previewing.');
      return;
    }

    // save original
    const el = selected;
    original = {};
    if (change.includes('->')) {
      const [, txt] = change.split('->').map(s=>s.trim());
      original.text = el.textContent;
      el.textContent= txt;
    } else if (change.includes(':')) {
      const [prop,val] = change.split(':').map(s=>s.trim());
      original.style = el.style.getPropertyValue(prop);
      el.style.setProperty(prop, val);
    } else {
      alert('Use CSS syntax (prop: value) or text -> newText.');
      return;
    }

    // switch buttons to Confirm/Revert
    const btnGroup = modal.querySelector('.button-group');
    btnGroup.innerHTML = `
      <button class="btn-cancel">Revert</button>
      <button class="btn-confirm">Commit</button>
    `;
    modal.querySelector('.btn-cancel').onclick = () => {
      // revert
      if (original.text!=null) selected.textContent = original.text;
      else selected.style.cssText = '';
      closeEditor();
    };
    modal.querySelector('.btn-confirm').onclick = handleCommit(change);
  }

  // 8) COMMIT LOGIC
  function handleCommit(desiredChange) {
    return async () => {
      // Save selector BEFORE closing editor (which clears selected)
      const el = selected;
      const selector = el.tagName.toLowerCase()
                + (el.id?`#${el.id}`:'')
                + (el.classList.length?'.'+[...el.classList].join('.'):'');

      closeEditor();
      showNotification('Creating pull request...');

      // Get GitHub token
      const githubToken = await window.clickShipAuth.getGitHubToken();

      const payload = {
        action: 'edit',
        hostname: window.location.hostname,
        selector,
        desiredChange,
        githubToken
      };

      chrome.runtime.sendMessage(payload, res => {
        if (res.error) {
          showNotification(`Error: ${res.error}`, true);
        } else if (res.prUrl) {
          // Show PR link notification for 10 seconds
          const prNotification = document.createElement('div');
          prNotification.innerHTML = `
            <div style="margin-bottom: 8px; font-weight: 600;">Pull request created</div>
            <a href="${res.prUrl}" target="_blank" style="color: #6366f1; text-decoration: none; font-weight: 500;">View PR #${res.prNumber} →</a>
          `;
          prNotification.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            padding: 16px 20px;
            background: #ffffff;
            color: #1e293b;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            z-index: 2147483647;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
            animation: cs-toast-in 0.2s ease-out;
          `;
          document.body.append(prNotification);
          setTimeout(() => {
            prNotification.style.animation = 'cs-toast-out 0.15s ease-in forwards';
            setTimeout(() => prNotification.remove(), 150);
          }, 10000);
        } else {
          showNotification('Change committed successfully');
        }
      });
    };
  }

  // 9) TOAST NOTIFICATION - Clean Minimal Style
  function showNotification(msg, isError=false) {
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 14px 20px;
      background: ${isError ? '#fef2f2' : '#f0fdf4'};
      color: ${isError ? '#991b1b' : '#166534'};
      border: 1px solid ${isError ? '#fecaca' : '#bbf7d0'};
      border-radius: 10px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
      animation: cs-toast-in 0.2s ease-out;
    `;
    document.body.append(n);
    setTimeout(() => {
      n.style.animation = 'cs-toast-out 0.15s ease-in forwards';
      setTimeout(() => n.remove(), 150);
    }, 4000);
  }
})();

} // End of GitHub check - don't run on github.com
else {
  console.log('🚫 click-ship disabled on github.com');
}
