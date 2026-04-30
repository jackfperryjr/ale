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
      <circle cx="16" cy="16" r="13.5" fill="#0D1A22" stroke="#E8A020" stroke-width="1.5"/>
      <rect x="7" y="15" width="13" height="11" fill="#0D1A22" stroke="#E8A020" stroke-width="1.5"/>
      <path d="M20 17 Q26 17 26 20.5 Q26 24 20 24" fill="none" stroke="#E8A020" stroke-width="1.5"/>
      <path d="M7 15 Q8.5 11 10 15 Q11.5 9.5 13 15 Q14.5 11 16.5 15 Q18 12 20 15 Z" fill="#E8A020"/>
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
