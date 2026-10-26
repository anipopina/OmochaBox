export type PlaySettings = { sound: boolean; vibration: boolean };
export const SETTINGS_KEY = 'omochabox-play-settings-v1';
const defaults: PlaySettings = { sound: true, vibration: true };
let settings = { ...defaults };
let memoryOnly = false;
const listeners = new Set<(settings: Readonly<PlaySettings>) => void>();
function read(): PlaySettings {
  if (memoryOnly) return settings;
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(SETTINGS_KEY) ?? 'null',
    );
    if (!parsed || typeof parsed !== 'object') return { ...defaults };
    const value = parsed as Record<string, unknown>;
    return {
      sound: typeof value.sound === 'boolean' ? value.sound : defaults.sound,
      vibration:
        typeof value.vibration === 'boolean'
          ? value.vibration
          : defaults.vibration,
    };
  } catch {
    return settings;
  }
}
function notify() {
  for (const listener of listeners) listener(settings);
}
function refresh() {
  const next = read();
  if (next.sound !== settings.sound || next.vibration !== settings.vibration) {
    settings = next;
    notify();
  }
}
settings = read();
export function getPlaySettings(): Readonly<PlaySettings> {
  return { ...settings };
}
export function setPlaySettings(next: Partial<PlaySettings>): boolean {
  settings = { ...settings, ...next };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    memoryOnly = true;
  }
  notify();
  return !memoryOnly;
}
export function onPlaySettings(
  listener: (settings: Readonly<PlaySettings>) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
window.addEventListener('storage', (event) => {
  if (event.key === SETTINGS_KEY || event.key === null) refresh();
});
window.addEventListener('pageshow', refresh);
window.addEventListener('focus', refresh);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refresh();
});
