const musicToggle = document.querySelector('.ms8-music-toggle');
const siteMusic = document.querySelector('.ms8-site-music');
const musicPreferenceKey = 'ms8-music-enabled';
const openerSeenKey = 'ms8-opener-seen';
let musicWanted = localStorage.getItem(musicPreferenceKey) === 'true';
let cheerContext;
let luxuryClickContext;

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
  ensureVerifiedSalesFeature();
  initLuxuryCursor();
  initLuxuryReveal();
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

async function ensureVerifiedSalesFeature() {
  if (window.location.pathname !== '/' && !document.body.classList.contains('template-index')) return;
  if (document.querySelector('.ms8-sales-feature')) return;

  const heroSection = document.querySelector('[id*="bought_it_online_hero"]');
  if (!heroSection) return;

  try {
    const response = await fetch('/products/candidate-phone-stand-for-desk.js', {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const product = await response.json();
    const price = product.price ? `$${(product.price / 100).toFixed(2)}` : '$12.99';
    const image = product.featured_image || product.images?.[0] || '';
    const section = document.createElement('section');
    section.className = 'ms8-sales-feature';
    section.setAttribute('aria-label', 'Featured verified product');
    section.innerHTML = `
      <div class="ms8-sales-feature__media">
        ${image ? `<img class="ms8-sales-feature__image" src="${image}" alt="${product.title || 'Adjustable phone stand'}" loading="eager">` : ''}
      </div>
      <div class="ms8-sales-feature__content">
        <p class="ms8-sales-feature__eyebrow">Verified fast-sale pick</p>
        <h2>Adjustable phone stand, priced to move.</h2>
        <p>A compact desk, counter, and nightstand stand for hands-free video calls, streaming, recipes, and charging setups. This product is supplier-linked, media-verified, and priced through the store profit gate before publication.</p>
        <div class="ms8-sales-feature__proof" aria-label="Product checks">
          <span>Verified supplier cost</span>
          <span>Real product media</span>
          <span>Secure Shopify checkout</span>
        </div>
        <div class="ms8-sales-feature__buy">
          <strong>${price}</strong>
          <a class="ms8-sales-feature__button" href="/products/candidate-phone-stand-for-desk">Shop the verified pick</a>
        </div>
      </div>
    `;
    heroSection.insertAdjacentElement('afterend', section);
  } catch {
    // Leave the existing Shopify-rendered content alone if product JSON is unavailable.
  }
}

function initLuxuryCursor() {
  if (window.matchMedia('(pointer: coarse), (prefers-reduced-motion: reduce)').matches) return;
  if (document.querySelector('.ms8-luxury-cursor')) return;

  const dot = document.createElement('span');
  const ring = document.createElement('span');
  dot.className = 'ms8-luxury-cursor';
  ring.className = 'ms8-luxury-cursor-ring';
  document.body.append(dot, ring);

  document.addEventListener(
    'pointermove',
    (event) => {
      document.documentElement.classList.add('ms8-cursor-ready');
      dot.style.transform = `translate3d(${event.clientX - 9}px, ${event.clientY - 9}px, 0)`;
      ring.style.transform = `translate3d(${event.clientX - 24}px, ${event.clientY - 24}px, 0)`;
    },
    { passive: true }
  );

  document.addEventListener('pointerdown', () => {
    document.documentElement.classList.add('ms8-cursor-active');
    playLuxuryClick();
  });
  document.addEventListener('pointerup', () => document.documentElement.classList.remove('ms8-cursor-active'));

  document.addEventListener(
    'mouseover',
    (event) => {
      const target = event.target instanceof Element ? event.target.closest('a, button, .product-card, .ms8-card, .ms8-sales-feature__media') : null;
      document.documentElement.classList.toggle('ms8-cursor-hover', Boolean(target));
    },
    { passive: true }
  );

  document.addEventListener(
    'mouseout',
    (event) => {
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('a, button, .product-card, .ms8-card, .ms8-sales-feature__media')) return;
      document.documentElement.classList.remove('ms8-cursor-hover');
    },
    { passive: true }
  );
}

function playLuxuryClick() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  luxuryClickContext = luxuryClickContext || new AudioContextClass();
  const oscillator = luxuryClickContext.createOscillator();
  const gain = luxuryClickContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(880, luxuryClickContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(130, luxuryClickContext.currentTime + 0.1);
  gain.gain.setValueAtTime(0.0001, luxuryClickContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.035, luxuryClickContext.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, luxuryClickContext.currentTime + 0.1);
  oscillator.connect(gain);
  gain.connect(luxuryClickContext.destination);
  oscillator.start();
  oscillator.stop(luxuryClickContext.currentTime + 0.11);
}

function initLuxuryReveal() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.shopify-section, .product-card, .ms8-sales-feature, .ms8-top-pick');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('ms8-revealed');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12 }
  );
  targets.forEach((target) => {
    target.classList.add('ms8-reveal');
    observer.observe(target);
  });
}
