// click-ship/packages/extension/content.js
console.log('📄 click-ship content script loaded');

let hoverOverlay = null;
let modal = null;
let selectedElement = null;

// Create modal styles
const modalStyles = document.createElement('style');
modalStyles.textContent = `
  .click-ship-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    padding: 24px;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 400px;
    width: 90%;
  }
  
  .click-ship-modal h3 {
    margin-top: 0;
    margin-bottom: 16px;
    font-size: 18px;
    color: #333;
  }
  
  .click-ship-modal textarea {
    width: 100%;
    height: 100px;
    margin-bottom: 16px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }
  
  .click-ship-modal .button-group {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
  
  .click-ship-modal button {
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 14px;
    cursor: pointer;
    font-weight: 500;
  }
  
  .click-ship-modal .submit-btn {
    background: #0070f3;
    color: white;
  }
  
  .click-ship-modal .submit-btn:hover {
    background: #0060df;
  }
  
  .click-ship-modal .cancel-btn {
    background: #f5f5f5;
    color: #666;
  }
  
  .click-ship-modal .cancel-btn:hover {
    background: #e5e5e5;
  }

  .click-ship-overlay {
    position: fixed;
    pointer-events: none;
    outline: 2px solid #0070f3;
    background: rgba(0, 112, 243, 0.1);
    z-index: 2147483646;
    transition: all 0.1s ease-out;
  }
`;
document.head.appendChild(modalStyles);

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: ${isError ? '#d32f2f' : '#00c853'};
    color: white;
    padding: 12px 24px;
    border-radius: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 2147483647;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = (isError ? '❌ ' : '✓ ') + message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.remove(), 5000);
}

// Create modal function
function createModal(element, selector) {
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.className = 'click-ship-modal';
  modal.innerHTML = `
    <h3>Describe your change</h3>
    <p style="margin: 0 0 12px; font-size: 13px; color: #666;">
      Selected: <code style="background: #f5f5f5; padding: 2px 6px; border-radius: 4px;">${selector}</code>
    </p>
    <textarea placeholder='Examples:
- "Make the background red"
- "Make text larger"
- "Add 20px padding"
- "Change text to Hello World"'></textarea>
    <div class="button-group">
      <button class="cancel-btn">Cancel</button>
      <button class="submit-btn">Apply Change</button>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const textarea = modal.querySelector('textarea');
  const submitBtn = modal.querySelector('.submit-btn');
  const cancelBtn = modal.querySelector('.cancel-btn');
  
  textarea.focus();
  
  submitBtn.addEventListener('click', () => handleSubmit(element, selector, textarea.value));
  cancelBtn.addEventListener('click', closeModal);
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function closeModal() {
  if (modal) {
    modal.remove();
    modal = null;
  }
  selectedElement = null;
}

async function handleSubmit(element, selector, desiredChange) {
  if (!desiredChange.trim()) {
    showNotification('Please describe the change you want to make', true);
    return;
  }
  
  const submitBtn = modal.querySelector('.submit-btn');
  submitBtn.textContent = 'Applying...';
  submitBtn.disabled = true;
  
  const payload = {
    hostname: window.location.hostname,
    selector,
    desiredChange
  };
  
  try {
    // Direct communication with the server
    const response = await fetch('http://localhost:8080/edit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    console.log('✅ Change applied successfully', data);
    closeModal();
    showNotification('Change applied! Refresh to see updates.');
    
  } catch (error) {
    console.error('⚠️ Error:', error);
    showNotification(error.message, true);
    closeModal();
  }
}

// Improved hover overlay
document.addEventListener('mousemove', e => {
  if (modal) return; // Don't show overlay when modal is open
  
  const el = e.target;
  
  // Skip if we're hovering over our own UI
  if (el.classList.contains('click-ship-overlay') || 
      el.classList.contains('click-ship-modal') || 
      el.closest('.click-ship-modal')) {
    if (hoverOverlay) hoverOverlay.remove();
    return;
  }
  
  // Only highlight elements with class or ID
  if (!el.id && el.classList.length === 0) {
    if (hoverOverlay) hoverOverlay.remove();
    return;
  }
  
  if (hoverOverlay) hoverOverlay.remove();
  
  const rect = el.getBoundingClientRect();
  hoverOverlay = document.createElement('div');
  hoverOverlay.className = 'click-ship-overlay';
  hoverOverlay.style.cssText = `
    top: ${rect.top}px;
    left: ${rect.left}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
  `;
  
  document.body.appendChild(hoverOverlay);
});

// Click handler
document.addEventListener('click', e => {
  const el = e.target;
  
  // Ignore clicks on our own UI
  if (el.classList.contains('click-ship-overlay') || 
      el.classList.contains('click-ship-modal') || 
      el.closest('.click-ship-modal')) {
    return;
  }
  
  // Only handle elements with class or ID
  if (!el.id && el.classList.length === 0) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  selectedElement = el;
  
  // Build selector
  const selector = el.tagName.toLowerCase() +
    (el.id ? `#${el.id}` : '') +
    (el.classList.length ? `.${[...el.classList].join('.')}` : '');
  
  createModal(el, selector);
}, true);

// Add slide-in animation
const animationStyles = document.createElement('style');
animationStyles.textContent = `
  @keyframes slideIn {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
`;
document.head.appendChild(animationStyles);

// Test if script is working
console.log('✅ click-ship content script fully loaded');