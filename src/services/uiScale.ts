const STORAGE_KEY = "proprius.uiScale";

/** Percent of the default 16px root size. */
export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 150;
export const UI_SCALE_STEP = 1;

export const DEFAULT_UI_SCALE = 112;

export function clampUiScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_UI_SCALE;
  const rounded = Math.round(value / UI_SCALE_STEP) * UI_SCALE_STEP;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, rounded));
}

export function loadUiScale(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(stored)) return clampUiScale(stored);
  } catch {
    // ignore storage failures
  }
  return DEFAULT_UI_SCALE;
}

export function saveUiScale(scale: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clampUiScale(scale)));
  } catch {
    // ignore storage failures
  }
}

export function applyUiScale(scale: number): void {
  const pixels = (16 * clampUiScale(scale)) / 100;
  document.documentElement.style.fontSize = `${pixels}px`;
}
