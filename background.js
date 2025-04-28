// background.js

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'fetchPage') {
      fetch(msg.url)
        .then(r => r.ok ? r.text() : Promise.reject(r.statusText))
        .then(html => sendResponse({ html }))
        .catch(err => sendResponse({ error: err.toString() }));
      return true;
    }
  
    if (msg.action === 'summarize') {
      fetch('http://localhost:5000/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg.text })
      })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        sendResponse({ summary: data.summary });
      })
      .catch(err => sendResponse({ error: err.message }));
      return true;
    }
  });
  