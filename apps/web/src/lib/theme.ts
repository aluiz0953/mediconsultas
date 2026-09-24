import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';

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
  // Android app: status/navigation bar icons must contrast with the page drawn behind them.
  if (Capacitor.isNativePlatform()) {
    void SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  }
}
