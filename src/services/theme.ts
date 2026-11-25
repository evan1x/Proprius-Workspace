const STORAGE_KEY = "proprius.theme";

export type ThemeMode = "dark" | "light";

export function loadTheme(): ThemeMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore storage failures
  }
}

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;
}
