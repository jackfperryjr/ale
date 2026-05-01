const ALE_CAP_ID   = 'ale-bottle-cap';
const ALE_PANEL_ID = 'ale-panel';
const CIRCUMFERENCE = 2 * Math.PI * 40;

let currentUrl     = window.location.href;
let currentVideoId = null;
let lastAnalysisId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getVideoId() {
  const host = window.location.hostname;
  if (host === 'www.youtube.com') {
    return new URLSearchParams(window.location.search).get('v');
  }
  if (host === 'x.com' || host === 'twitter.com') {
    const m = window.location.pathname.match(/\/status\/(\d+)/);
    return m ? m[1] : null;
  }
  return null;
}

function truncateUrl(url, n = 36) {
  try {
    const { hostname, pathname } = new URL(url);
    const short = hostname.replace('www.', '') + pathname;
    return short.length > n ? short.slice(0, n) + '…' : short;
  } catch {
    return url.length > n ? url.slice(0, n) + '…' : url;
  }
}

// ── Panel ─────────────────────────────────────────────────────────────────────

function buildPanel() {
  const panel = document.createElement('div');
  panel.id = ALE_PANEL_ID;
  panel.innerHTML = `
    <div class="alep-header">
      <span class="alep-logo">ALE</span>
      <span class="alep-tagline">Authenticity Logic Engine</span>
      <button class="alep-close" id="alep-close">✕</button>
    </div>
    <div class="alep-url" id="alep-url"></div>
    <div class="alep-body">
      <div id="alep-idle" class="alep-idle">
        <span>Starting analysis…</span>
      </div>
      <div id="alep-pour" class="alep-pour" style="display:none">
        <div class="alep-glass">
          <div class="alep-liquid" id="alep-liquid"></div>
          <div class="alep-foam"></div>
        </div>
        <span class="alep-pour-label">Analyzing…</span>
      </div>
      <div id="alep-score" class="alep-score" style="display:none">
        <div class="alep-ring-wrap">
          <svg viewBox="0 0 100 100" class="alep-ring-svg">
            <circle class="alep-ring-bg" cx="50" cy="50" r="40"/>
            <circle class="alep-ring-fill" id="alep-ring-fill" cx="50" cy="50" r="40"
              stroke-dasharray="${CIRCUMFERENCE}" stroke-dashoffset="${CIRCUMFERENCE}"/>
          </svg>
          <div class="alep-score-val" id="alep-score-val">—</div>
        </div>
        <div class="alep-score-label" id="alep-score-label">—</div>
      </div>
    </div>
    <div class="alep-actions">
      <button id="alep-verify" class="alep-btn-verify" style="display:none">Re-analyze</button>
      <button id="alep-brewmaster" class="alep-btn-brewmaster" style="display:none">Request Human Verification</button>
    </div>
    <div class="alep-status" id="alep-status"></div>
  `;

  panel.querySelector('#alep-close').addEventListener('click', (e) => {
    e.stopPropagation();
    closePanel();
  });

  panel.querySelector('#alep-verify').addEventListener('click', (e) => {
    e.stopPropagation();
    runAnalysis();
  });

  panel.querySelector('#alep-brewmaster').addEventListener('click', (e) => {
    e.stopPropagation();
    requestBrewmaster();
  });

  // Swallow all clicks so they don't reach the video player underneath
  panel.addEventListener('click', (e) => e.stopPropagation());

  return panel;
}

function openPanel(player) {
  closePanel();
  currentVideoId = getVideoId();
  lastAnalysisId = null;

  const panel = buildPanel();
  panel.querySelector('#alep-url').textContent = truncateUrl(currentUrl);
  player.appendChild(panel);

  // Show cached result instantly; otherwise kick off a fresh analysis
  chrome.storage.local.get(currentUrl, (cache) => {
    if (cache[currentUrl]) {
      lastAnalysisId = cache[currentUrl].id ?? null;
      renderScore(cache[currentUrl]);
      // Reveal re-analyze in case they want a fresh scan
      const reBtn = document.getElementById('alep-verify');
      if (reBtn) reBtn.style.display = 'block';
    } else {
      runAnalysis();
    }
  });
}

function closePanel() {
  document.getElementById(ALE_PANEL_ID)?.remove();
}

// ── Panel state ───────────────────────────────────────────────────────────────

function panelEl(id) {
  return document.getElementById(id);
}

function setStatus(msg) {
  const el = panelEl('alep-status');
  if (el) el.textContent = msg;
}

function showIdle(msg) {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (pour)  pour.style.display  = 'none';
  if (score) score.style.display = 'none';
  if (idle)  { idle.style.display = 'flex'; idle.querySelector('span').textContent = msg; }
}

function showPour() {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (idle)  idle.style.display  = 'none';
  if (score) score.style.display = 'none';
  if (pour)  pour.style.display  = 'flex';

  const liquid = panelEl('alep-liquid');
  if (!liquid) return;
  liquid.style.height = '0%';
  let pct = 0;
  const iv = setInterval(() => {
    pct = Math.min(pct + 1.5, 85);
    liquid.style.height = `${pct}%`;
    if (pct >= 85) clearInterval(iv);
  }, 40);
}

function renderScore(data) {
  const idle  = panelEl('alep-idle');
  const pour  = panelEl('alep-pour');
  const score = panelEl('alep-score');
  if (idle)  idle.style.display  = 'none';
  if (pour)  pour.style.display  = 'none';
  if (score) score.style.display = 'flex';

  const val   = data.reality_score;
  const color = val >= 70 ? '#00C875' : val >= 40 ? '#F0A020' : '#E03050';
  const label = val >= 70 ? '✓ Pure ALE' : val >= 40 ? '⚠ Mixed Pour' : '✗ Skunked';

  const ring = panelEl('alep-ring-fill');
  if (ring) {
    ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - val / 100);
    ring.style.stroke = color;
  }

  const valEl = panelEl('alep-score-val');
  if (valEl) valEl.textContent = `${Math.round(val)}%`;

  const labelEl = panelEl('alep-score-label');
  if (labelEl) { labelEl.textContent = label; labelEl.style.color = color; }

  // Update bottle cap ring color
  const cap = document.getElementById(ALE_CAP_ID);
  if (cap) {
    cap.classList.remove('ale-analyzing');
    const ring = cap.querySelector('.ale-cap-ring');
    if (ring) ring.setAttribute('stroke', color);
    cap.title = `ALE: ${Math.round(val)}% — ${data.label}`;
  }

  // Show brewmaster option for anything not confidently real
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (brewmasterBtn && val < 85) brewmasterBtn.style.display = 'block';
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function runAnalysis() {
  const verifyBtn = panelEl('alep-verify');
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (verifyBtn) verifyBtn.disabled = true;
  if (brewmasterBtn) brewmasterBtn.style.display = 'none';
  setStatus('');
  showPour();

  const result = await chrome.runtime.sendMessage({
    type: 'ANALYZE',
    url: currentUrl,
    videoId: currentVideoId,
  });

  if (!result || result.error) {
    showIdle('');
    setStatus(result?.error ?? 'Unknown error. Is the ALE API running?');
    if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.display = 'block'; }
    return;
  }

  lastAnalysisId = result.id;
  chrome.storage.local.set({ [currentUrl]: result });
  renderScore(result);
  if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.style.display = 'block'; }
}

async function requestBrewmaster() {
  const brewmasterBtn = panelEl('alep-brewmaster');
  if (brewmasterBtn) brewmasterBtn.disabled = true;
  setStatus('Sending to brewmaster queue…');

  const result = await chrome.runtime.sendMessage({
    type: 'QUEUE_BREWMASTER',
    url: currentUrl,
    videoId: currentVideoId,
    analysisId: lastAnalysisId,
  });

  if (!result || result.error) {
    setStatus(result?.error ?? 'Failed to queue.');
    if (brewmasterBtn) brewmasterBtn.disabled = false;
    return;
  }

  setStatus('✓ Queued for human review. A brewmaster will verify this shortly.');
  if (brewmasterBtn) brewmasterBtn.style.display = 'none';
}

// ── Bottle cap ────────────────────────────────────────────────────────────────

function buildCap() {
  const cap = document.createElement('div');
  cap.id = ALE_CAP_ID;
  cap.title = 'ALE — Click to verify this content';
  const iconUrl = chrome.runtime.getURL('icons/android-chrome-192x192.png');
  cap.innerHTML = `
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="ale-cap-clip">
          <circle cx="16" cy="16" r="12"/>
        </clipPath>
      </defs>
      <circle class="ale-cap-ring" cx="16" cy="16" r="14" fill="#0D1A22" stroke="#E8A020" stroke-width="2"/>
      <image href="${iconUrl}" x="4" y="4" width="24" height="24" clip-path="url(#ale-cap-clip)"/>
    </svg>
  `;

  cap.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (document.getElementById(ALE_PANEL_ID)) {
      closePanel();
    } else {
      openPanel(cap.parentElement);
    }
  });

  return cap;
}

function resetCap() {
  closePanel();
  document.getElementById(ALE_CAP_ID)?.remove();
}

function injectBottleCap(player) {
  if (document.getElementById(ALE_CAP_ID)) return;
  player.style.position = 'relative';
  player.appendChild(buildCap());
}

function tryInject() {
  const host = window.location.hostname;
  if (host === 'www.youtube.com') {
    const player = document.querySelector('#movie_player, ytd-player');
    if (player) injectBottleCap(player);
  } else if (host === 'x.com' || host === 'twitter.com') {
    document.querySelectorAll('[data-testid="videoPlayer"]').forEach(injectBottleCap);
  } else if (host === 'www.tiktok.com') {
    const player = document.querySelector('[class*="DivVideoWrapper"], video');
    if (player?.parentElement) injectBottleCap(player.parentElement);
  } else if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const player = document.querySelector('.vp-player-layout, #player');
    if (player) injectBottleCap(player);
  } else {
    const video = document.querySelector('video');
    if (video?.parentElement) injectBottleCap(video.parentElement);
  }
}

tryInject();

const observer = new MutationObserver(() => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    currentUrl = newUrl;
    resetCap();
    tryInject();
  } else if (!document.getElementById(ALE_CAP_ID)) {
    tryInject();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
