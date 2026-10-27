/// <reference types="vite/client" />

interface Window {
  webkitAudioContext?: typeof AudioContext;
}

declare module 'virtual:game-previews' {
  const previews: Record<string, () => { className: string; html: string }>;
  export default previews;
}
