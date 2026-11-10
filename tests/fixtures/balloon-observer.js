// Observe delivered application frames, not when the CDP client reads them.
window.rafCalls = 0;
window.pendingRafs = new Set();
window.balloonTouch = null;
window.balloonFullFrame = null;
const balloonNativeRaf = window.requestAnimationFrame.bind(window);
const balloonNativeCancel = window.cancelAnimationFrame.bind(window);
window.requestAnimationFrame = (callback) => {
  const id = balloonNativeRaf((time) => {
    window.pendingRafs.delete(id);
    window.rafCalls++;
    callback(time);
    if (
      window.balloonFullFrame === null &&
      document.querySelector('#held')?.dataset.full === 'true' &&
      document.querySelector('#pump')?.getAttribute('aria-pressed') === 'true'
    ) {
      window.balloonFullFrame = {
        calls: window.rafCalls,
        pending: window.pendingRafs.size,
      };
    }
    const touch = window.balloonTouch;
    if (
      touch &&
      touch.frames.length < 2 &&
      touch.frames.at(-1)?.time !== time &&
      touch.element.dataset.tapped === 'true'
    ) {
      const matrix = new DOMMatrix(getComputedStyle(touch.element).transform);
      touch.frames.push({ time, x: matrix.m41, y: matrix.m42 });
    }
  });
  window.pendingRafs.add(id);
  return id;
};
window.cancelAnimationFrame = (id) => {
  window.pendingRafs.delete(id);
  balloonNativeCancel(id);
};
document.addEventListener(
  'pointerdown',
  (event) => {
    if (
      !(event.target instanceof HTMLImageElement) ||
      !event.target.classList.contains('balloon')
    )
      return;
    const bounds = event.target.getBoundingClientRect();
    window.balloonTouch = {
      element: event.target,
      trusted: event.isTrusted,
      directionX: event.clientX < bounds.x + bounds.width / 2 ? 1 : -1,
      directionY: event.clientY < bounds.y + bounds.height / 2 ? 1 : -1,
      frames: [],
    };
  },
  true,
);
