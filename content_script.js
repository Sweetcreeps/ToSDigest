// content_script.js

/**
 * content_script.js
 *
 * This script is injected into web pages to detect the Terms of Service (ToS)
 * or Privacy Policy link. When detected, it displays a banner prompting the user to
 * summarize said ToS. Upon user interaction, it weill fetche and parse the text, shows a
 * loading spinner (with an optional warning for very large documents), and finally
 * displays a polished summary or error panel.
 */

(async () => {
    // If the UI is already present, do nothing (prevents double-injection)
    if (document.getElementById('tosdigest-ui')) return;
  
    // 0) Inject spinner keyframes for the loading animation (only once)
    if (!document.getElementById('tosdigest-spinner-style')) {
      const style = document.createElement('style');
      style.id = 'tosdigest-spinner-style';
      style.textContent = `
        @keyframes tos-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  
    // RegExp to match common ToS/Privacy keywords in URLs or link text
    const keyRx = /\b(privacy center|privacy policy|privacy|legal|user agreement|terms of service|terms and conditions|policies|terms)\b/i;
    const maxAttempts = 5;               // How many times to retry link detection
    const ONE_SHOT_THRESHOLD = 50000;    // Character count threshold for chunking
    let attempts = 0;                    // Counter for detection attempts
    let detectedLink = null;             // Holds the found ToS/Privacy URL
  
    /**
     * detectLink()
     *
     * Attempts to find a ToS/Privacy page by:
     * 1) Checking if the current URL path matches the key regex
     * 2) Scanning all <a> tags for matching text or href
     * Repeats up to maxAttempts before giving up.
     *
     * @returns {Promise<boolean>} true if a link/page was detected or attempts exhausted
     */
    async function detectLink() {
      attempts++;
      // 1a) If current path itself looks like a ToS page, use that
      if (keyRx.test(location.pathname)) {
        detectedLink = location.href;
        return true;
      }
      // 1b) Otherwise scan all anchors on the page
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find(a => keyRx.test(a.textContent) || keyRx.test(a.href));
      if (match) {
        detectedLink = match.href;
        return true;
      }
      // 1c) If we've tried enough times, stop polling
      return attempts >= maxAttempts;
    }
  
    /**
     * injectBanner()
     *
     * Inserts the initial banner into the page, prompting the user
     * that a ToS summary is available. Provides "Summarize" and close controls.
     */
    function injectBanner() {
      const c = document.createElement('div');
      c.id = 'tosdigest-ui';
      Object.assign(c.style, {
        position: 'fixed',
        top: '80px',
        right: '30px',
        width: '320px',
        background: '#ffffff',
        border: '1px solid #ddd',
        borderRadius: '10px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        fontFamily: 'Arial, sans-serif',
        zIndex: 2147483647,
        overflow: 'hidden',
        animation: 'tos-fade-in 0.3s ease'
      });
  
      // Inner HTML includes fade-in & pulse animations, header, message, and actions
      c.innerHTML = `
        <style>
          @keyframes tos-fade-in {
            from { opacity: 0; transform: translateY(-10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes tos-pulse {
            0% { box-shadow: 0 0 0 rgba(0,123,255,0.7); }
            70% { box-shadow: 0 0 10px rgba(0,123,255,0); }
            100% { box-shadow: 0 0 0 rgba(0,123,255,0); }
          }
        </style>
  
        <!-- Header -->
        <div style="
          background: #0063B1;
          color: #ffffff;
          padding: 12px 16px;
          font-size: 16px;
          font-weight: 600;
        ">
          ToSDigest
        </div>
  
        <!-- Message -->
        <div style="
          background: #f9f9f9;
          color: #333333;
          padding: 16px;
          font-size: 14px;
          line-height: 1.4;
        ">
         A Terms of Service summary is available for this website.
        </div>
  
        <!-- Actions -->
        <div style="
          display: flex;
          justify-content: flex-end;
          align-items: center;
          background: #ffffff;
          padding: 8px 16px;
        ">
          <button id="tosdigest-run" style="
            background: #0063B1;
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            animation: tos-pulse 2s infinite;
          ">
            Summarize
          </button>
          <span id="tosdigest-close" style="
            margin-left: 12px;
            cursor: pointer;
            font-size: 20px;
            color: #888888;
          ">
            ×
          </span>
        </div>
      `;
      document.documentElement.appendChild(c);
  
      // Close button removes the banner
      c.querySelector('#tosdigest-close').onclick = () => c.remove();
      // Summarize button shows loading state and triggers fetch+AI flow
      c.querySelector('#tosdigest-run').onclick = () => {
        showLoading(c, false);
        runScrapeAndSummarize(c);
      };
    }
  
    /**
     * showLoading(container, large)
     *
     * Replaces the container's content with a spinner and optional
     * warning if the ToS is particularly large.
     *
     * @param {HTMLElement} container  The banner element
     * @param {boolean} large          Whether to show the "may take a while" note
     */
    function showLoading(container, large) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;
                    justify-content:center;padding:16px;">
          <div style="
            border:4px solid #f3f3f3;
            border-top:4px solid #3498db;
            border-radius:50%;
            width:24px;height:24px;
            animation: tos-spin 1s linear infinite;
          "></div>
          <span style="margin-left:8px;
                       font-family:Arial,sans-serif;
                       font-size:14px;">
            Loading…
          </span>
        </div>
        ${large ? `<div style="
          font-family:Arial,sans-serif;
          font-size:12px;
          color:#666;
          text-align:center;
          padding:0 8px 8px;
        ">The ToS is very large; this may take a while...</div>` : ``}
      `;
    }
  
    /**
     * runScrapeAndSummarize(container)
     *
     * Fetches or parses the ToS text, sends it to the AI for summarization,
     * and finally injects the result panel.
     *
     * @param {HTMLElement} container  The element to show loading in, then replace
     */
    async function runScrapeAndSummarize(container) {
      let rawText = '';
  
      // Extract text from current page if URL matches, otherwise fetch it
      if (keyRx.test(location.pathname)) {
        let paras = Array.from(document.querySelectorAll('main p'));
        if (!paras.length) paras = Array.from(document.querySelectorAll('p'));
        rawText = paras.length
          ? paras.map(p => p.textContent.trim()).join('\n\n')
          : document.body.innerText.trim();
      } else {
        const { html, error: fe } = await new Promise(res =>
          chrome.runtime.sendMessage({ action: 'fetchPage', url: detectedLink }, res)
        );
        if (fe) {
          return injectResult(`<strong style="color:red;">Fetch error:</strong> ${fe}`, true);
        }
        let doc;
        try {
          doc = new DOMParser().parseFromString(html, 'text/html');
        } catch (e) {
          return injectResult(`<strong style="color:red;">Parse error:</strong> ${e.message}`, true);
        }
        let paras = Array.from(doc.querySelectorAll('main p'));
        if (!paras.length) paras = Array.from(doc.querySelectorAll('p'));
        rawText = paras.length
          ? paras.map(p => p.textContent.trim()).join('\n\n')
          : doc.body.innerText.trim();
      }
  
      // If no text found, show an error
      if (!rawText) {
        return injectResult('<strong style="color:red;">Error:</strong> No content extracted.', true);
      }
  
      // If the ToS is above the one-shot threshold, warn the user it may take longer
      if (rawText.length > ONE_SHOT_THRESHOLD) {
        showLoading(container, true);
      }
  
      // Send the text off to the background/summarizer
      const { summary, error: se } = await new Promise(res =>
        chrome.runtime.sendMessage({ action: 'summarize', text: rawText }, res)
      );
      if (se) {
        return injectResult(`<strong style="color:red;">AI error:</strong> ${se}`, true);
      }
      // Display the final summary
      injectResult(summary, false);
    }
  
    /**
     * injectResult(raw, isError)
     *
     * Renders the final summary (or error) in a polished panel:
     * - Header with site name and close button
     * - Legend for ✓/⚠️/✗ symbols
     * - Alternating rows for each summary line
     *
     * @param {string} raw       The AI-generated text (raw lines)
     * @param {boolean} isError  Whether this is an error message
     */
    function injectResult(raw, isError) {
      const host = location.host.replace(/^www\./, '');
      const title = isError ? `${host} ToS Error` : `${host} ToS Summary`;
  
      // Reuse or create the container element
      let c = document.getElementById('tosdigest-ui');
      if (!c) {
        c = document.createElement('div');
        document.documentElement.appendChild(c);
      }
      c.id = 'tosdigest-ui';
  
      // Apply consistent styling and fade-in animation
      Object.assign(c.style, {
        position: 'fixed',
        top: '80px',
        right: '30px',
        width: '360px',
        maxHeight: '70vh',
        overflowY: 'auto',
        background: '#ffffff',
        border: '1px solid #ddd',
        borderRadius: '10px',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
        fontFamily: 'Arial, sans-serif',
        color: '#333333',
        zIndex: 2147483647,
        animation: 'tos-fade-in 0.3s ease'
      });
  
      // Build and inject the HTML structure
      c.innerHTML = `
        <style>
          @keyframes tos-fade-in {
            from { opacity: 0; transform: translateY(-10px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        </style>
  
        <!-- Header -->
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0063B1;
          color: #ffffff;
          padding: 12px 16px;
          font-size: 16px;
          font-weight: 600;
        ">
          <span>${title}</span>
          <span id="tosdigest-close" style="
            cursor: pointer;
            font-size: 20px;
            color: #ffffff;
          ">×</span>
        </div>
  
        <!-- Legend -->
        <div style="
          display: flex;
          justify-content: space-around;
          padding: 12px 16px;
          font-size: 14px;
          background: #f1f1f1;
          border-bottom: 1px solid #eee;
        ">
          <span><span style="color:green;font-weight:bold;">✓</span> Good</span>
          <span><span style="color:orange;font-weight:bold;">⚠️</span> Warning</span>
          <span><span style="color:red;font-weight:bold;">✗</span> Bad</span>
        </div>
  
        <!-- Summary Items -->
        <div>
          ${raw.split(/\r?\n/).map((line, i) => `
            <div style="
              padding: 10px 16px;
              background: ${i % 2 ? '#fafafa' : '#ffffff'};
              border-bottom: 1px solid #eee;
              font-size: 14px;
              line-height: 1.5;
            ">
              ${line
                .replace(/✓/g, '<span style="color:green;">✓</span>')
                .replace(/⚠️|⚠/g, '<span style="color:orange;">⚠️</span>')
                .replace(/✗/g, '<span style="color:red;">✗</span>')
              }
            </div>
          `).join('')}
        </div>
      `;
      // Close button handler
      c.querySelector('#tosdigest-close').onclick = () => c.remove();
    }
  
    // 6) Start the detection loop on page load
    (async function poll() {
      const done = await detectLink();
      if (detectedLink) {
        // If we find a ToS link, show the banner
        injectBanner();
      } else if (!done) {
        // Retry until attempts run out
        setTimeout(poll, 1000);
      }
      // When attempts exhausted without finding a link, do nothing
    })();
  
  })();
  