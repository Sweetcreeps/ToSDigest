// content_script.js
(async () => {
    // Avoid double-injection of any UI panel
    if (document.getElementById('tosdigest-ui')) return;
  
    const storage = chrome.storage.local;
    const maxAttempts = 5;
    const keyRx = /\b(privacy center|privacy policy|privacy|legal|user agreement|terms of service|terms and conditions|terms)\b/i;
  
    let attempts = 0;
    let detectedLink = null;
  
    // 1) Poll until we find a link or exhaust attempts
    async function detectLink() {
      attempts++;
      console.log(`[ToSDigest] detectLink attempt ${attempts}/${maxAttempts}`);
      // If current URL looks like ToS page, treat that as link
      if (keyRx.test(location.pathname)) {
        detectedLink = location.href;
        return true;
      }
      // Otherwise scan anchors
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find(a => keyRx.test(a.textContent) || keyRx.test(a.href));
      if (match) {
        detectedLink = match.href;
        return true;
      }
      return attempts >= maxAttempts;
    }
  
    // 2) Inject the small “Summarize” banner
    function injectBanner() {
      const banner = document.createElement('div');
      banner.id = 'tosdigest-ui';
      banner.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-family:Arial,sans-serif;">ToSDigest available</span>
          <button id="tosdigest-run" style="margin-left:10px;padding:4px 8px;cursor:pointer">
            Summarize ToS
          </button>
        </div>`;
      Object.assign(banner.style, {
        position: 'fixed', top: '0', left: '0', right: '0',
        backgroundColor: '#007bff', color: 'white',
        padding: '8px', fontSize: '14px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        zIndex: '2147483647'
      });
      document.documentElement.appendChild(banner);
  
      document.getElementById('tosdigest-run').addEventListener('click', () => {
        // once clicked, remove banner and run full scrape+summarize
        banner.remove();
        runScrapeAndSummarize();
      });
    }
  
    // 3) Your existing scrape + summarize logic, but run only once
    async function runScrapeAndSummarize() {
      console.log('[ToSDigest] Running full ToS extraction & AI summarization…');
      let rawText = '';
  
      // If on a ToS URL, parse live DOM; else fetch via background
      if (keyRx.test(location.pathname)) {
        let paras = Array.from(document.querySelectorAll('main p'));
        if (!paras.length) paras = Array.from(document.querySelectorAll('p'));
        rawText = paras.length
          ? paras.map(p=>p.textContent.trim()).join('\n\n')
          : document.body.innerText.trim();
      } else {
        const { html, error: fetchErr } = await new Promise(res =>
          chrome.runtime.sendMessage({ action: 'fetchPage', url: detectedLink }, res)
        );
        if (fetchErr) {
          return injectResult(`<strong>Error fetching ToS:</strong> ${fetchErr}`);
        }
        let doc;
        try {
          doc = new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
          return injectResult(`<strong>Error parsing HTML:</strong> ${e.message}`);
        }
        let paras = Array.from(doc.querySelectorAll('main p'));
        if (!paras.length) paras = Array.from(doc.querySelectorAll('p'));
        rawText = paras.length
          ? paras.map(p=>p.textContent.trim()).join('\n\n')
          : doc.body.innerText.trim();
      }
  
      if (!rawText) {
        return injectResult('<strong>Error:</strong> No textual content extracted.');
      }
  
      storage.set({ tosdigest_tos: rawText });
      console.log('[ToSDigest] Raw text length:', rawText.length);
  
      // Call AI
      const { summary, error: sumErr } = await new Promise(res =>
        chrome.runtime.sendMessage({ action: 'summarize', text: rawText }, res)
      );
      if (sumErr) {
        return injectResult(`<strong>Summarization failed:</strong> ${sumErr}`);
      }
      injectResult(`<strong>ToSDigest Summary:</strong><br><pre>${summary}</pre>`);
    }
  
    // 4) Inject full result panel in place of banner
    function injectResult(html) {
      const panel = document.createElement('div');
      panel.id = 'tosdigest-ui';
      panel.innerHTML = html;
      Object.assign(panel.style, {
        position: 'fixed', top: '0', left: '0', right: '0',
        maxHeight: '50vh', overflowY: 'auto',
        backgroundColor: 'white', color: '#333',
        padding: '10px', fontFamily: 'Arial, sans-serif',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        zIndex: '2147483647'
      });
      document.documentElement.appendChild(panel);
    }
  
    // 5) Kick off detection loop
    (async function pollDetect() {
      const done = await detectLink();
      if (detectedLink) {
        injectBanner();
      } else if (!done) {
        setTimeout(pollDetect, 1000);
      } else {
        console.log('[ToSDigest] No ToS link found—giving up.');
      }
    })();
  })();
  