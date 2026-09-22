const STORAGE_KEY = 'mediconsultas-theme';

export type Theme = 'light' | 'dark';

// Light is always the default — an explicit choice in the profile page's
// theme setting is the only thing that switches it, never the OS preference.
export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(STORAGE_KEY, theme);
}
