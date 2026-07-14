const musicToggle = document.querySelector('.ms8-music-toggle');
const siteMusic = document.querySelector('.ms8-site-music');
const musicPreferenceKey = 'ms8-music-enabled';
const openerSeenKey = 'ms8-opener-seen';
let musicWanted = localStorage.getItem(musicPreferenceKey) === 'true';
let cheerContext;

function assetUrl(fileName) {
  const scripts = [...document.scripts];
  const currentScript =
    document.currentScript ||
    scripts.find((script) => script.src && script.src.includes('ms8-store-experience.js'));

  if (!currentScript?.src) return fileName;
  const url = new URL(currentScript.src);
  const parts = url.pathname.split('/');
  parts[parts.length - 1] = fileName;
  url.pathname = parts.join('/');
  url.search = '';
  return url.href;
}

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

function playRequestedMusic() {
  musicWanted = true;
  setMusicState(true);
}

function tryStartMusicFromOpener() {
  if (!siteMusic) return;
  musicWanted = true;
  localStorage.setItem(musicPreferenceKey, 'true');
  musicToggle?.setAttribute('aria-pressed', 'true');
  musicToggle?.setAttribute('aria-label', 'Turn music off');
  const label = musicToggle?.querySelector('.ms8-music-toggle__text');
  if (label) label.textContent = 'Music on';
  siteMusic.volume = 0.34;
  siteMusic.play().catch(() => {
    if (label) label.textContent = 'Tap for music';
  });
}

document.addEventListener(
  'pointerdown',
  () => {
    if (musicWanted && siteMusic?.paused) setMusicState(true);
  },
  { once: true, passive: true }
);

setMusicState(musicWanted);

function closeOpener(opener) {
  if (!opener || opener.classList.contains('is-closing')) return;
  opener.classList.add('is-closing');
  sessionStorage.setItem(openerSeenKey, 'true');
  setTimeout(() => opener.remove(), 520);
}

function showOpeningVideo() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (sessionStorage.getItem(openerSeenKey) === 'true') return;

  const opener = document.createElement('section');
  opener.className = 'ms8-opening-video';
  opener.setAttribute('aria-label', 'BoughtitOnline opening video. Tap or click to skip.');
  opener.innerHTML = `
    <video class="ms8-opening-video__media" src="${assetUrl('bought-it-online-opener.mp4')}" autoplay playsinline muted preload="auto"></video>
    <div class="ms8-opening-video__shade" aria-hidden="true"></div>
    <button class="ms8-opening-video__skip" type="button">Skip intro</button>
  `;
  document.body.append(opener);

  const video = opener.querySelector('video');
  const startMusic = () => tryStartMusicFromOpener();
  const skip = () => closeOpener(opener);

  startMusic();

  opener.addEventListener(
    'pointerdown',
    () => {
      startMusic();
      skip();
    },
    { once: true, passive: true }
  );
  opener.querySelector('button')?.addEventListener('click', skip);
  video?.addEventListener('ended', () => {
    startMusic();
    closeOpener(opener);
  });
  video?.play().catch(() => {
    opener.classList.add('needs-tap');
  });
}

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
  showOpeningVideo();
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
