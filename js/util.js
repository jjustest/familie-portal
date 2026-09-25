import { CONFIG } from './config.js';

const tz = CONFIG.timeZone;

const dateKeyFmt = new Intl.DateTimeFormat('sv-SE', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
});
const hourFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: tz, hour: '2-digit', hourCycle: 'h23',
});

/** 'YYYY-MM-DD' for datoen i dansk tid */
export function dateKey(d) {
  return dateKeyFmt.format(d);
}

/** Time på døgnet (0-23) i dansk tid */
export function localHour(d) {
  return parseInt(hourFmt.format(d), 10);
}

/** Dato-objekt kl. 12 lokal tid ud fra 'YYYY-MM-DD' (sikker mod sommertid) */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Mandag i den uge, som d ligger i (kl. 12) */
export function weekStart(d) {
  const r = fromKey(dateKey(d));
  const dow = (r.getDay() + 6) % 7; // man=0
  return addDays(r, -dow);
}

export function fmt(d, opts) {
  return new Intl.DateTimeFormat(CONFIG.locale, { timeZone: tz, ...opts }).format(d);
}

export function timeHM(d) {
  return fmt(d, { hour: '2-digit', minute: '2-digit' });
}

export function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};
