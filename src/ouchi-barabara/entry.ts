import '../shared/home-button';
import { requireElement } from '../shared/dom';

// Comparison assets are reachable only through development imports, so ordinary
// and AWS builds cannot accidentally publish unselected candidates.
void (async () => {
  const query = new URLSearchParams(location.search);
  const loading = requireElement('#loading', HTMLElement);
  if (import.meta.env.DEV && query.has('sound-review')) {
    loading.remove();
    await import('./sound-review/app');
  } else {
    const lifecycle = new AbortController();
    const pauseLoading = () =>
      loading.toggleAttribute('data-paused', document.hidden);
    pauseLoading();
    document.addEventListener('visibilitychange', pauseLoading, {
      signal: lifecycle.signal,
    });
    try {
      if (import.meta.env.DEV && query.has('sound-preview'))
        await import('./sound-review/preview');
      await import('./app');
      requireElement('#field', HTMLCanvasElement).inert = false;
    } finally {
      lifecycle.abort();
      loading.remove();
    }
  }
})();
