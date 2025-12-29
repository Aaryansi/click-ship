// click-ship/packages/extension/content.js

console.log('📄 click-ship content script loaded');

// Don't run on GitHub pages (to avoid interfering with OAuth)
if (!window.location.hostname.includes('github.com')) {

(() => {
  // 1) INJECT STYLES
  const css = `
    .click-ship-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      z-index: 2147483645;
    }
    .click-ship-modal {
      position: fixed;
      top: 50%; left: 50%;
      transform: translate(-50%,-50%);
      background: #1f1f1f;
      color: #eee;
      padding: 0;
      width: 90%;
      max-width: 400px;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 2147483646;
      overflow: hidden;
    }
    .click-ship-modal.dragging {
      user-select: none;
    }
    .click-ship-drag-handle {
      background: #2a2a2a;
      padding: 12px 16px;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #333;
    }
    .click-ship-drag-handle:hover {
      background: #333;
    }
    .click-ship-drag-hint {
      font-size: 11px;
      color: #666;
    }
    .click-ship-modal-body {
      padding: 16px 24px 24px;
    }
    .click-ship-modal h2 {
      margin: 0;
      font-size: 18px;
      color: #3B82F6;
    }
    .click-ship-modal p {
      font-size: 13px;
      margin: 0 0 12px;
      color: #aaa;
      overflow-wrap: anywhere;
    }
    .click-ship-modal textarea {
      width: 100%;
      height: 80px;
      padding: 8px;
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      color: #eee;
      margin-bottom: 12px;
      font-size: 14px;
      resize: vertical;
    }
    .click-ship-modal .button-group {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
    .click-ship-modal button {
      padding: 8px 14px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    .click-ship-modal .btn-cancel {
      background: #444;
      color: #ddd;
    }
    .click-ship-modal .btn-cancel:hover {
      background: #555;
    }
    .click-ship-modal .btn-preview {
      background: #3B82F6;
      color: white;
    }
    .click-ship-modal .btn-preview:hover {
      background: #2563EB;
    }
    .click-ship-modal .btn-confirm {
      background: #10B981;
      color: white;
    }
    .click-ship-modal .btn-confirm:hover {
      background: #059669;
    }
    .click-ship-overlay {
      position: fixed;
      pointer-events: none;
      outline: 2px solid #3B82F6;
      background: rgba(59,130,246,0.1);
      z-index: 2147483644;
      transition: all 0.1s ease-out;
    }
    .click-ship-user-info {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 12px;
      border-bottom: 1px solid #444;
    }
    .click-ship-user-info img {
      border-radius: 50%;
      width: 32px;
      height: 32px;
    }
    .click-ship-user-info .user-details {
      flex: 1;
    }
    .click-ship-user-info .user-name {
      font-weight: 600;
      color: #3B82F6;
      font-size: 14px;
    }
    .click-ship-user-info .user-login {
      font-size: 12px;
      color: #888;
    }
    .click-ship-user-info .btn-logout {
      padding: 4px 12px;
      background: #444;
      color: #ddd;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .click-ship-user-info .btn-logout:hover {
      background: #555;
    }
    .click-ship-login-prompt {
      text-align: center;
    }
    .click-ship-login-prompt .btn-login {
      background: #3B82F6;
      color: white;
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      width: 100%;
      margin-top: 12px;
    }
    .click-ship-login-prompt .btn-login:hover {
      background: #2563EB;
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
          <h2>Click-Ship Editor</h2>
          <span class="click-ship-drag-hint">drag to move</span>
        </div>
        <div class="click-ship-modal-body">
          <div class="click-ship-login-prompt">
            <p>Please authenticate with GitHub to make changes</p>
            <button class="btn-login">🔐 Login with GitHub</button>
          </div>
        </div>
      `;
      document.body.append(backdrop, modal);
      setupDrag(modal);

      modal.querySelector('.btn-login').onclick = async () => {
        try {
          closeEditor(); // Close modal before opening OAuth popup
          showNotification('Opening GitHub login...');
          await window.clickShipAuth.loginWithGitHub();
          showNotification('✅ Successfully logged in!');
        } catch (error) {
          showNotification(`Login failed: ${error.message}`, true);
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
        <h2>Click-Ship Editor</h2>
        <span class="click-ship-drag-hint">drag to move</span>
      </div>
      <div class="click-ship-modal-body">
        <div class="click-ship-user-info">
          <img src="${user.avatar_url}" alt="${user.login}" />
          <div class="user-details">
            <div class="user-name">${user.name || user.login}</div>
            <div class="user-login">@${user.login}</div>
          </div>
          <button class="btn-logout">Logout</button>
        </div>
        <p>Element: <code>${selector}</code></p>
        <textarea placeholder="e.g. padding: 24px  (or)  text -> Hello"></textarea>
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
      showNotification('Logged out');
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
      showNotification('Creating pull request…');

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
          showNotification(`✅ Pull request created!`);
          // Show PR link for 10 seconds
          const prNotification = document.createElement('div');
          prNotification.innerHTML = `
            <div>✅ Pull request created!</div>
            <a href="${res.prUrl}" target="_blank" style="color: #10B981; text-decoration: underline;">View PR #${res.prNumber}</a>
          `;
          prNotification.style.cssText = `
            position: fixed; bottom:20px; right:20px;
            padding:12px 18px; background:#10B981;
            color:white; border-radius:4px; z-index:2147483647;
            font-family:system-ui; font-size:14px;
          `;
          document.body.append(prNotification);
          setTimeout(()=>prNotification.remove(), 10000);
        } else {
          showNotification('✅ Change committed!');
        }
      });
    };
  }

  // 9) SIMPLE TOAST
  function showNotification(msg, isError=false) {
    const n = document.createElement('div');
    n.textContent = msg;
    n.style.cssText = `
      position: fixed; bottom:20px; right:20px;
      padding:12px 18px; background:${isError?'#d32f2f':'#10B981'};
      color:white; border-radius:4px; z-index:2147483647;
      font-family:system-ui; font-size:14px;
    `;
    document.body.append(n);
    setTimeout(()=>n.remove(), 4000);
  }
})();

} // End of GitHub check - don't run on github.com
else {
  console.log('🚫 click-ship disabled on github.com');
}
