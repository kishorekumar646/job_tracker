// Author: Kishore Kumar
import { create } from 'zustand'
import { AppTheme, getSettings, saveSettings } from '../utils/settings'

// Tailwind palette shades 50 → 950 as RGB channels (drives the `brand` colour scale).
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const PALETTES: Record<AppTheme, string[]> = {
  gold: ['252 249 242', '247 236 215', '240 220 181', '230 201 151', '213 178 120', '148 111 58', '145 105 48', '116 82 37', '88 65 34', '60 47 28', '34 28 20'],
  indigo: ['238 242 255', '224 231 255', '199 210 254', '165 180 252', '129 140 248', '99 102 241', '79 70 229', '67 56 202', '55 48 163', '49 46 129', '30 27 75'],
  violet: ['245 243 255', '237 233 254', '221 214 254', '196 181 253', '167 139 250', '139 92 246', '124 58 237', '109 40 217', '91 33 182', '76 29 149', '46 16 101'],
  teal: ['240 253 250', '204 251 241', '153 246 228', '94 234 212', '45 212 191', '20 184 166', '13 148 136', '15 118 110', '17 94 89', '19 78 74', '4 47 46'],
  rose: ['255 241 242', '255 228 230', '254 205 211', '253 164 175', '251 113 133', '244 63 94', '225 29 72', '190 18 60', '159 18 57', '136 19 55', '76 5 25'],
}

export const THEMES: { id: AppTheme; label: string; swatch: string }[] = [
  { id: 'gold', label: 'Champagne', swatch: '#e6c997' },
  { id: 'indigo', label: 'Indigo', swatch: '#6366f1' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'teal', label: 'Teal', swatch: '#14b8a6' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
]

export function injectThemeVars(theme: AppTheme) {
  const vars = SHADES.map((n, i) => `--brand-${n}:${PALETTES[theme][i]};`).join('')
  document.getElementById('jp-theme')?.remove()
  const el = document.createElement('style')
  el.id = 'jp-theme'
  el.textContent = `:root{${vars}}`
  document.head.appendChild(el)
}

interface ThemeState {
  theme: AppTheme
  load: () => void
  setTheme: (t: AppTheme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getSettings().theme,
  load: () => {
    const theme = getSettings().theme
    injectThemeVars(theme)
    set({ theme })
  },
  setTheme: (theme) => {
    saveSettings({ theme })
    injectThemeVars(theme)
    set({ theme })
  },
}))
