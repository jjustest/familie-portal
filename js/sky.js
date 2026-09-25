// Himlen bag portalen: farver efter solens gang, effekter efter vejret.

import { CONFIG } from './config.js';
import { sunTimes } from './sun.js';

// [top, midt, bund]
const PAL = {
  night: ['#050818', '#0d1733', '#1b2a52'],
  dawn:  ['#1d2657', '#7a5796', '#f3a27b'],
  day:   ['#1559b5', '#3b8be0', '#8cc5f4'],
  dusk:  ['#161a45', '#86457a', '#f0875b'],
};

// Vejret blander en grå nuance ind i himlen
const WX_MIX = {
  clear:   null,
  fair:    null,
  partly:  ['#5b6f86', 0.15],
  cloudy:  ['#56657a', 0.5],
  fog:     ['#8391a0', 0.55],
  drizzle: ['#4a5a6d', 0.5],
  lightrain: ['#435366', 0.55],
  rain:    ['#35455a', 0.62],
  heavyrain: ['#2b3a4d', 0.7],
  showers: ['#46586e', 0.45],
  sleet:   ['#5a6878', 0.55],
  snow:    ['#8a9bb0', 0.45],
  thunder: ['#262f40', 0.72],
};

// Skyer / regn / sne
const FX = {
  clear:     { clouds: 0.05 },
  fair:      { clouds: 0.25 },
  partly:    { clouds: 0.5 },
  cloudy:    { clouds: 0.85 },
  fog:       { clouds: 1 },
  drizzle:   { clouds: 0.8, rain: 0.35 },
  lightrain: { clouds: 0.8, rain: 0.5 },
  rain:      { clouds: 0.9, rain: 0.8 },
  heavyrain: { clouds: 0.95, rain: 1 },
  showers:   { clouds: 0.65, rain: 0.55 },
  sleet:     { clouds: 0.85, rain: 0.4, snow: 0.4 },
  snow:      { clouds: 0.8, snow: 0.9 },
  thunder:   { clouds: 1, rain: 0.9 },
};

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = rgb => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * t));
const mixPal = (a, b, t) => a.map((c, i) => mix(c, b[i], t));
const clamp01 = x => Math.max(0, Math.min(1, x));

/** Himmelfarver + fase ud fra tidspunkt og soltider */
function phase(now, sun) {
  const t = now.getTime();
  const H = 3600e3;
  const { dawn, sunrise, sunset, dusk } = sun;
  if (t < dawn || t > dusk.getTime() + H * 0.5) return { pal: PAL.night, name: 'night' };
  if (t < sunrise) return { pal: mixPal(PAL.night, PAL.dawn, clamp01((t - dawn) / (sunrise - dawn))), name: 'dawn' };
  if (t < sunrise.getTime() + H) return { pal: mixPal(PAL.dawn, PAL.day, clamp01((t - sunrise) / H)), name: 'dawn' };
  if (t < sunset.getTime() - H) return { pal: PAL.day, name: 'day' };
  if (t < sunset) return { pal: mixPal(PAL.day, PAL.dusk, clamp01((t - (sunset - H)) / H)), name: 'dusk' };
  return { pal: mixPal(PAL.dusk, PAL.night, clamp01((t - sunset) / (dusk.getTime() + H * 0.5 - sunset))), name: 'dusk' };
}

export function isNight(now = new Date()) {
  const sun = sunTimes(now, CONFIG.location.lat, CONFIG.location.lon);
  return now < sun.sunrise || now > sun.sunset;
}

export function sunInfo(now = new Date()) {
  return sunTimes(now, CONFIG.location.lat, CONFIG.location.lon);
}

/** Opdater himlen. kind = vejrtype fra icons.js (fx 'rain') */
export function updateSky(kind = 'partly', now = new Date()) {
  const sun = sunInfo(now);
  const ph = phase(now, sun);
  let pal = ph.pal;
  const wm = WX_MIX[kind];
  if (wm) pal = pal.map(c => mix(c, wm[0], wm[1] * (ph.name === 'night' ? 0.35 : 1)));

  const fx = FX[kind] ?? FX.partly;
  const root = document.documentElement.style;
  root.setProperty('--sky1', pal[0]);
  root.setProperty('--sky2', pal[1]);
  root.setProperty('--sky3', pal[2]);

  // Sol/måne-skær: vandret efter dagens forløb, lodret efter "højde"
  const dayLen = sun.sunset - sun.sunrise;
  const p = (now - sun.sunrise) / dayLen;             // 0 = solopgang, 1 = solnedgang
  const night = ph.name === 'night';
  const x = night ? 78 : 12 + clamp01(p) * 76;
  const y = night ? 14 : 70 - Math.sin(clamp01(p) * Math.PI) * 58;
  const warm = ph.name === 'dawn' || ph.name === 'dusk';
  const cloudy = (fx.clouds ?? 0) > 0.7;
  root.setProperty('--glow-x', `${x}%`);
  root.setProperty('--glow-y', `${y}%`);
  root.setProperty('--glow-color', night ? '200, 215, 255' : warm ? '255, 170, 110' : '255, 236, 190');
  root.setProperty('--glow-a', String((night ? 0.12 : warm ? 0.55 : 0.35) * (cloudy ? 0.35 : 1)));

  root.setProperty('--stars', String(night ? (cloudy ? 0.15 : 0.9) : 0));
  root.setProperty('--clouds', String(fx.clouds ?? 0));
  root.setProperty('--cloud-tint', night ? '150, 165, 195' : kind.includes('rain') || kind === 'thunder' ? '185, 195, 210' : '255, 255, 255');
  root.setProperty('--rain-a', String(fx.rain ?? 0));
  root.setProperty('--snow-a', String(fx.snow ?? 0));

  document.body.dataset.sky = ph.name;
  document.body.dataset.wx = kind;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', pal[0]);
}
