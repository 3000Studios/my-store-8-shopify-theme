const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function getGallery(target) {
  if (!(target instanceof Element)) return null;
  return target.closest('.card-gallery');
}

async function playGalleryVideo(gallery) {
  if (!gallery || motionQuery.matches) return;
  const video = gallery.querySelector('.card-gallery__hover-video video');
  if (!(video instanceof HTMLVideoElement)) return;
  gallery.dataset.videoPreview = 'playing';
  video.muted = true;
  video.loop = true;
  try {
    await video.play();
  } catch {
    gallery.dataset.videoPreview = 'idle';
  }
}

function pauseGalleryVideo(gallery) {
  if (!gallery) return;
  const video = gallery.querySelector('.card-gallery__hover-video video');
  if (video instanceof HTMLVideoElement) {
    video.pause();
    video.currentTime = 0;
  }
  gallery.dataset.videoPreview = 'idle';
}

document.addEventListener(
  'pointerenter',
  (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    playGalleryVideo(getGallery(event.target));
  },
  true
);

document.addEventListener(
  'pointerleave',
  (event) => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pauseGalleryVideo(getGallery(event.target));
  },
  true
);

document.addEventListener('focusin', (event) => {
  playGalleryVideo(getGallery(event.target));
});

document.addEventListener('focusout', (event) => {
  pauseGalleryVideo(getGallery(event.target));
});

document.addEventListener(
  'pointerup',
  (event) => {
    if (event.pointerType === 'mouse') return;
    const gallery = getGallery(event.target);
    if (!gallery?.querySelector('.card-gallery__hover-video video')) return;
    if (gallery.dataset.videoPreview === 'playing') {
      pauseGalleryVideo(gallery);
      return;
    }
    event.preventDefault();
    playGalleryVideo(gallery);
  },
  { passive: false }
);
