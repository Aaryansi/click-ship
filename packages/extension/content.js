// click-ship/packages/extension/content.js

console.log('📄 click-ship content script loaded');

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
      padding: 24px;
      width: 90%;
      max-width: 400px;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.7);
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 2147483646;
    }
    .click-ship-modal h2 {
      margin: 0 0 12px;
      font-size: 20px;
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

  // 4) CLICK HANDLER -> OPEN MODAL
  document.addEventListener('click', e => {
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

    openEditor(selector);
  }, true);

  // 5) OPEN EDITOR UI
  function openEditor(selector) {
    backdrop = document.createElement('div');
    backdrop.className = 'click-ship-backdrop';
    modal    = document.createElement('div');
    modal.className = 'click-ship-modal';
    modal.innerHTML = `
      <h2>Click-Ship Editor</h2>
      <p>Element: <code>${selector}</code></p>
      <textarea placeholder="e.g. padding: 24px  (or)  text -> Hello"></textarea>
      <div class="button-group">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-preview">Preview</button>
      </div>
    `;
    document.body.append(backdrop, modal);

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
    return () => {
      closeEditor();
      showNotification('Committing…');
      const payload = {
        hostname: window.location.hostname,
        selector: selected.tagName.toLowerCase()
                  + (selected.id?`#${selected.id}`:'')
                  + (selected.classList.length?'.'+[...selected.classList].join('.'):''),
        desiredChange
      };
      chrome.runtime.sendMessage(payload, res => {
        if (res.error) {
          showNotification(`Error: ${res.error}`, true);
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
