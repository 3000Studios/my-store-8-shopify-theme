const menuSelector = '.menu-list__link, .header-menu a[href], nav a[href]';
let audioContext;
let lastPlayed = 0;

function playMenuClick() {
  const now = Date.now();
  if (now - lastPlayed < 120) return;
  lastPlayed = now;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  audioContext = audioContext || new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(640, audioContext.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(420, audioContext.currentTime + 0.055);

  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.075);

  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.08);
}

document.addEventListener(
  'click',
  (event) => {
    const target = event.target instanceof Element ? event.target.closest(menuSelector) : null;
    if (!target) return;
    playMenuClick();
  },
  { passive: true }
);
