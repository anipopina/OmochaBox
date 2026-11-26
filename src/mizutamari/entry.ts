void (async () => {
  const query = new URLSearchParams(location.search);
  if (import.meta.env.DEV && query.has('sound-review')) {
    await import('./sound-review/app');
  } else {
    if (import.meta.env.DEV && query.has('sound-preview'))
      await import('./sound-review/preview');
    await import('./app');
  }
})();
