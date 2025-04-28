// popup.js
document.getElementById('run').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.textContent = 'Running...';
  
    // Inject content_script.js into the active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content_script.js']
      });
      status.textContent = 'Done!';
    } catch (e) {
      status.textContent = `Error: ${e.message}`;
    }
  });
  