const ALE_ICON_ID = 'ale-bottle-cap';

// Mutable — updated on every SPA navigation
let currentUrl = window.location.href;

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

function buildCap() {
  const cap = document.createElement('div');
  cap.id = ALE_ICON_ID;
  cap.title = 'ALE — Click to verify this content';
  cap.innerHTML = `
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#C8860A" stroke="#8B5E0A" stroke-width="2"/>
      <circle cx="16" cy="16" r="10" fill="#E8A020" stroke="#C8860A" stroke-width="1"/>
      <text x="16" y="20" text-anchor="middle" font-family="serif" font-size="11"
            font-weight="bold" fill="white">ALE</text>
    </svg>
  `;

  cap.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (cap.classList.contains('ale-analyzing')) return;
    cap.classList.add('ale-analyzing');
    chrome.runtime.sendMessage({
      type: 'QUICK_ANALYZE',
      url: currentUrl,        // always reads the live value
      videoId: getVideoId()
    });
  });

  return cap;
}

function resetCap() {
  document.getElementById(ALE_ICON_ID)?.remove();
}

function injectBottleCap(player) {
  if (document.getElementById(ALE_ICON_ID)) return;
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
    // Generic fallback: attach to the first visible <video> element's parent
    const video = document.querySelector('video');
    if (video?.parentElement) injectBottleCap(video.parentElement);
  }
}

tryInject();

const observer = new MutationObserver(() => {
  const newUrl = window.location.href;
  if (newUrl !== currentUrl) {
    // SPA navigation — tear down old cap and re-inject fresh
    currentUrl = newUrl;
    resetCap();
    tryInject();
  } else if (!document.getElementById(ALE_ICON_ID)) {
    tryInject();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'ANALYZE_RESULT') return;
  const cap = document.getElementById(ALE_ICON_ID);
  if (!cap) return;
  cap.classList.remove('ale-analyzing');
  cap.classList.add(msg.score >= 70 ? 'ale-real' : 'ale-skunked');
  cap.title = `ALE Score: ${msg.score}% — ${msg.label}`;
});
