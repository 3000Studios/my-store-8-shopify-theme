const musicToggle = document.querySelector('.ms8-music-toggle');
const siteMusic = document.querySelector('.ms8-site-music');
const musicPreferenceKey = 'ms8-music-enabled';
let musicWanted = localStorage.getItem(musicPreferenceKey) === 'true';
let cheerContext;

function setMusicState(isOn) {
  if (!musicToggle || !siteMusic) return;
  musicWanted = isOn;
  localStorage.setItem(musicPreferenceKey, String(isOn));
  musicToggle.setAttribute('aria-pressed', String(isOn));
  musicToggle.setAttribute('aria-label', isOn ? 'Turn music off' : 'Turn music on');
  const label = musicToggle.querySelector('.ms8-music-toggle__text');
  if (label) label.textContent = isOn ? 'Music on' : 'Music off';

  if (isOn) {
    siteMusic.volume = 0.34;
    siteMusic.play().catch(() => {
      if (label) label.textContent = 'Tap for music';
    });
  } else {
    siteMusic.pause();
  }
}

musicToggle?.addEventListener('click', () => setMusicState(!musicWanted));

document.addEventListener(
  'pointerdown',
  () => {
    if (musicWanted && siteMusic?.paused) setMusicState(true);
  },
  { once: true, passive: true }
);

setMusicState(musicWanted);

function ensureLoader() {
  let loader = document.querySelector('.ms8-page-loader');
  if (loader) return loader;
  loader = document.createElement('div');
  loader.className = 'ms8-page-loader';
  loader.innerHTML = '<span></span><strong>BoughtitOnline</strong>';
  document.body.append(loader);
  requestAnimationFrame(() => loader.classList.add('is-hidden'));
  return loader;
}

window.addEventListener('pageshow', () => {
  ensureLoader()?.classList.add('is-hidden');
  document.documentElement.classList.remove('ms8-page-leaving');
});

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin !== window.location.origin || url.hash || link.target === '_blank' || link.hasAttribute('download')) return;

  document.documentElement.classList.add('ms8-page-leaving');
  ensureLoader()?.classList.remove('is-hidden');

  if (!document.startViewTransition) return;
  event.preventDefault();
  document.startViewTransition(() => {
    window.location.href = url.href;
  });
});

function playCheer() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  cheerContext = cheerContext || new AudioContextClass();
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((note, index) => {
    const oscillator = cheerContext.createOscillator();
    const gain = cheerContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(note, cheerContext.currentTime + index * 0.045);
    gain.gain.setValueAtTime(0.0001, cheerContext.currentTime + index * 0.045);
    gain.gain.exponentialRampToValueAtTime(0.055, cheerContext.currentTime + index * 0.045 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, cheerContext.currentTime + index * 0.045 + 0.16);
    oscillator.connect(gain);
    gain.connect(cheerContext.destination);
    oscillator.start(cheerContext.currentTime + index * 0.045);
    oscillator.stop(cheerContext.currentTime + index * 0.045 + 0.18);
  });
}

function launchConfetti() {
  const colors = ['#ff8a1c', '#28d985', '#ffd166', '#1b6f9f', '#ffffff'];
  const root = document.createElement('div');
  root.className = 'ms8-confetti';
  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement('i');
    piece.style.setProperty('--x', `${Math.random() * 100}vw`);
    piece.style.setProperty('--delay', `${Math.random() * 0.18}s`);
    piece.style.setProperty('--spin', `${Math.random() * 520 + 160}deg`);
    piece.style.background = colors[i % colors.length];
    root.append(piece);
  }
  document.body.append(root);
  setTimeout(() => root.remove(), 1800);
}

document.addEventListener('shopify:cart:lines-update', (event) => {
  if (event.detail?.didError) return;
  playCheer();
  launchConfetti();
});
