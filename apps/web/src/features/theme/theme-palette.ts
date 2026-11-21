import type { ThemeConfig } from '@try4t/shared';

export const DEFAULT_LIGHT_BG = '#f0fdf4';
export const DEFAULT_DARK_BG = '#0b1915';
export const DEFAULT_ACCENT = '#10b981';

export const LIGHT_BACKGROUND_PRESETS = [
  { name: 'Xanh bạc hà', hex: '#f0fdf4' },
  { name: 'Trắng sạch', hex: '#ffffff' },
  { name: 'Kem dịu mắt', hex: '#faf7f2' },
  { name: 'Xám sương', hex: '#f1f5f9' },
] as const;

export const DARK_BACKGROUND_PRESETS = [
  { name: 'Xanh Rừng', hex: '#0b1915' },
  { name: 'Đêm sâu', hex: '#09090b' },
  { name: 'Xanh Slate', hex: '#0f172a' },
  { name: 'Tím Midnight', hex: '#13111c' },
] as const;

export const ACCENT_PRESETS = [
  { name: 'Ngọc lục bảo (Mặc định)', hex: '#10b981' },
  { name: 'Trung tính', hex: '#18181b' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Xanh biển', hex: '#0ea5e9' },
  { name: 'Hồng đỏ', hex: '#e11d48' },
  { name: 'Cam năng lượng', hex: '#f97316' },
  { name: 'Tím Violet', hex: '#8b5cf6' },
  { name: 'Vàng hổ phách', hex: '#d97706' },
] as const;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

function mixHex(hex1: string, hex2: string, ratio: number): string {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  if (!c1 || !c2) return hex1;
  return rgbToHex(
    c1.r + (c2.r - c1.r) * ratio,
    c1.g + (c2.g - c1.g) * ratio,
    c1.b + (c2.b - c1.b) * ratio,
  );
}

export function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  return brightness > 145;
}

const CUSTOM_CSS_VARS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--popover',
  '--popover-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--border',
  '--input',
  '--primary',
  '--primary-foreground',
  '--accent',
  '--accent-foreground',
  '--ring',
];

export function resolveActiveBackground(
  config: ThemeConfig | null | undefined,
  resolvedMode: 'light' | 'dark',
): string | null {
  if (!config) return null;
  if (resolvedMode === 'light') {
    if (config.lightBackground) return config.lightBackground;
    if (config.backgroundColor && isLightColor(config.backgroundColor)) {
      return config.backgroundColor;
    }
    return null;
  }
  if (config.darkBackground) return config.darkBackground;
  if (config.backgroundColor && !isLightColor(config.backgroundColor)) {
    return config.backgroundColor;
  }
  return null;
}

export function applyThemePaletteToDom(
  config: ThemeConfig | null,
  resolvedMode: 'light' | 'dark',
) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  for (const key of CUSTOM_CSS_VARS) {
    root.style.removeProperty(key);
  }
  root.removeAttribute('data-density');
  root.removeAttribute('data-font-scale');
  root.removeAttribute('data-reduced-motion');

  if (!config) return;

  if (config.density) {
    root.setAttribute('data-density', config.density);
  }
  if (config.fontScale) {
    root.setAttribute('data-font-scale', config.fontScale);
  }
  if (config.reducedMotion) {
    root.setAttribute('data-reduced-motion', 'true');
  }

  const activeBg = resolveActiveBackground(config, resolvedMode);

  if (activeBg) {
    const light = isLightColor(activeBg);
    const fg = light ? '#09090b' : '#fafafa';
    const card = light ? mixHex(activeBg, '#ffffff', 0.65) : mixHex(activeBg, '#ffffff', 0.05);
    const secondary = light
      ? mixHex(activeBg, '#000000', 0.06)
      : mixHex(activeBg, '#ffffff', 0.09);
    const muted = light ? mixHex(activeBg, '#000000', 0.05) : mixHex(activeBg, '#ffffff', 0.07);
    const mutedFg = light ? mixHex(activeBg, '#000000', 0.55) : mixHex(activeBg, '#ffffff', 0.62);
    const border = light ? mixHex(activeBg, '#000000', 0.13) : mixHex(activeBg, '#ffffff', 0.14);

    root.style.setProperty('--background', activeBg);
    root.style.setProperty('--foreground', fg);
    root.style.setProperty('--card', card);
    root.style.setProperty('--card-foreground', fg);
    root.style.setProperty('--popover', card);
    root.style.setProperty('--popover-foreground', fg);
    root.style.setProperty('--secondary', secondary);
    root.style.setProperty('--secondary-foreground', fg);
    root.style.setProperty('--muted', muted);
    root.style.setProperty('--muted-foreground', mutedFg);
    root.style.setProperty('--border', border);
    root.style.setProperty('--input', border);

    if (!config.accentColor) {
      root.style.setProperty('--primary', DEFAULT_ACCENT);
      root.style.setProperty('--primary-foreground', light ? '#ffffff' : '#052e16');
      root.style.setProperty('--ring', DEFAULT_ACCENT);
    }
  }

  if (config.accentColor) {
    const accent = config.accentColor;
    const accentIsLight = isLightColor(accent);
    root.style.setProperty('--primary', accent);
    root.style.setProperty('--primary-foreground', accentIsLight ? '#09090b' : '#ffffff');
    root.style.setProperty('--ring', accent);
  }
}
