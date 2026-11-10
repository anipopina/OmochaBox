/// <reference types="vite/client" />

interface Window {
  webkitAudioContext?: typeof AudioContext;
}

declare module 'virtual:game-previews' {
  const previews: Record<string, () => { className: string; html: string }>;
  export default previews;
}

declare module 'virtual:game-visibility' {
  export const defaultGameIds: readonly string[];
  export const showPrototypesByDefault: boolean;
}
