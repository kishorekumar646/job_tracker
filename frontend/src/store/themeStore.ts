// Author: Kishore Kumar
import { create } from 'zustand'
import { AppTheme, getSettings } from '../utils/settings'

interface ThemeState {
  theme: AppTheme
  setTheme: (t: AppTheme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getSettings().theme ?? 'indigo',
  setTheme: (theme) => set({ theme }),
}))

const THEME_VARS: Record<AppTheme, string> = {
  indigo: `
    --color-primary-300:165 180 252;--color-primary-400:129 140 248;
    --color-primary-500:99 102 241;--color-primary-600:79 70 229;
    --color-primary-700:67 56 202;--color-primary-800:55 48 163;
    --color-primary-900:49 46 129;--color-primary-950:30 27 75;
    --color-primary-hex-300:#a5b4fc;--color-primary-hex-400:#818cf8;
    --color-primary-hex-500:#6366f1;--color-primary-hex-600:#4f46e5;
    --color-primary-rail:#2e2f6e;--color-primary-signal:#c7d2fe;`,
  violet: `
    --color-primary-300:196 181 253;--color-primary-400:167 139 250;
    --color-primary-500:139 92 246;--color-primary-600:124 58 237;
    --color-primary-700:109 40 217;--color-primary-800:91 33 182;
    --color-primary-900:76 29 149;--color-primary-950:46 16 101;
    --color-primary-hex-300:#c4b5fd;--color-primary-hex-400:#a78bfa;
    --color-primary-hex-500:#8b5cf6;--color-primary-hex-600:#7c3aed;
    --color-primary-rail:#3b1f6e;--color-primary-signal:#ddd6fe;`,
  teal: `
    --color-primary-300:94 234 212;--color-primary-400:45 212 191;
    --color-primary-500:20 184 166;--color-primary-600:13 148 136;
    --color-primary-700:15 118 110;--color-primary-800:17 94 89;
    --color-primary-900:19 78 74;--color-primary-950:4 47 46;
    --color-primary-hex-300:#5eead4;--color-primary-hex-400:#2dd4bf;
    --color-primary-hex-500:#14b8a6;--color-primary-hex-600:#0d9488;
    --color-primary-rail:#0f3f3c;--color-primary-signal:#99f6e4;`,
  rose: `
    --color-primary-300:253 164 175;--color-primary-400:251 113 133;
    --color-primary-500:244 63 94;--color-primary-600:225 29 72;
    --color-primary-700:190 18 60;--color-primary-800:159 18 57;
    --color-primary-900:136 19 55;--color-primary-950:76 5 25;
    --color-primary-hex-300:#fda4af;--color-primary-hex-400:#fb7185;
    --color-primary-hex-500:#f43f5e;--color-primary-hex-600:#e11d48;
    --color-primary-rail:#5a1028;--color-primary-signal:#fecdd3;`,
}

export function injectThemeVars(theme: AppTheme) {
  // Always remove and re-append so this tag is last in <head> and wins
  // over any Vite-injected CSS (e.g. index.css :root block).
  document.getElementById('rca-theme')?.remove()
  const el = document.createElement('style')
  el.id = 'rca-theme'
  el.textContent = `:root{${THEME_VARS[theme]}}`
  document.head.appendChild(el)
}

export function getPrimaryColor(shade: '300' | '400' | '500' | '600') {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-primary-hex-${shade}`)
    .trim()
}
