// background.js

// Listen for messages from the content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // If the content script asks us to fetch a page (to bypass CORS), do it here
    if (msg.action === 'fetchPage') {
      fetch(msg.url)
        .then(response => {
          // If the request was successful, grab the text; otherwise, reject with the status
          if (response.ok) return response.text();
          return Promise.reject(response.statusText);
        })
        .then(html => {
          // Send the fetched HTML back to the sender
          sendResponse({ html });
        })
        .catch(err => {
          // If something went wrong, return an error message
          sendResponse({ error: err.toString() });
        });
      // Return true to keep the message channel open for the async response
      return true;
    }
  
    // If the content script sends text for summarization, forward it to the local API
    if (msg.action === 'summarize') {
      fetch('http://localhost:5000/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Pass the entire ToS text as JSON
        body: JSON.stringify({ text: msg.text })
      })
        .then(response => response.json())
        .then(data => {
          // If the API returned an error, throw to catch block
          if (data.error) throw new Error(data.error);
          // Otherwise, send the summary back
          sendResponse({ summary: data.summary });
        })
        .catch(err => {
          // Return any errors (e.g., network failure, parsing issue)
          sendResponse({ error: err.message });
        });
      // Keep the channel open for the async response
      return true;
    }
  });
  
  
  // Handle clicks on the extension’s toolbar icon
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      // Inject content script into the current tab so the UI can run
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_script.js']
      });
    } catch (e) {
      // If injection fails (e.g., chrome:// pages not supported), notify the user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/32.png',
        title: 'ToSDigest',
        message: 'No Terms of Service found or page not supported.'
      });
    }
  });
  