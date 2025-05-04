// click-ship/packages/extension/background.js

console.log('🚀 click-ship background loaded');

// Listen for messages from content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('✉️ payload received in background', msg);
  
  // Validate the message contains required fields
  if (!msg.hostname || !msg.selector || !msg.desiredChange) {
    console.error('⚠️ Invalid payload', msg);
    sendResponse({ error: 'Invalid payload' });
    return;
  }
  
  // Send the message to the local server
  fetch('http://localhost:8080/edit', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(msg)
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log('✅ Server response:', data);
      // Show a notification with the results (without icon)
      if (data.ok) {
        chrome.notifications.create({
          type: 'basic',
          title: 'click-ship Success',
          message: `Change applied to ${data.file ? data.file.split('/').pop() : 'unknown file'}`
        });
      }
      sendResponse(data);
    })
    .catch(err => {
      console.error('⚠️ Server error:', err);
      sendResponse({ error: err.message });
    });
  
  // Return true to indicate we'll respond asynchronously
  return true;
});