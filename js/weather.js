// Henter vejr fra DMI (via Open-Meteo, model dmi_seamless) og Yr (api.met.no)
// og omsætter begge til samme format:
//
// {
//   source: 'dmi' | 'yr',
//   fetchedAt: ms,
//   current: { temp, feels, wind, kind, night },
//   days: [{ date:'YYYY-MM-DD', min, max, precip, wind, kind }]
// }

import { CONFIG } from './config.js';
import { kindFromWmo, kindFromYr } from './icons.js';
import { dateKey, localHour, store } from './util.js';

export const SOURCES = {
  dmi: { label: 'DMI', credit: 'DMI HARMONIE via Open-Meteo', link: 'https://www.dmi.dk/' },
  yr:  { label: 'YR',  credit: 'Yr / MET Norway',            link: 'https://www.yr.no/' },
};

// ---------- DMI via Open-Meteo ----------
// dmi_seamless = DMI HARMONIE de første ~2,5 døgn, derefter ECMWF (op til 15 døgn).

async function fetchDmi(loc, days) {
  const p = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    models: 'dmi_seamless',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    wind_speed_unit: 'ms',
    timezone: CONFIG.timeZone,
    forecast_days: String(days),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!res.ok) throw new Error(`DMI/Open-Meteo svarede ${res.status}`);
  const j = await res.json();
  const c = j.current;
  const d = j.daily;
  return {
    source: 'dmi',
    fetchedAt: Date.now(),
    current: {
      temp: c.temperature_2m,
      feels: c.apparent_temperature,
      wind: c.wind_speed_10m,
      kind: kindFromWmo(c.weather_code),
      night: c.is_day === 0,
    },
    days: d.time.map((date, i) => ({
      date,
      min: d.temperature_2m_min[i],
      max: d.temperature_2m_max[i],
      precip: d.precipitation_sum[i],
      wind: d.wind_speed_10m_max[i],
      kind: kindFromWmo(d.weather_code[i]),
    })).filter(x => x.max !== null),
  };
}

// ---------- Yr / MET Norway ----------
// Locationforecast 2.0 compact. Browseren sender selv User-Agent/Origin.
// Timevise data de første ~2,5 døgn, derefter 6-timers intervaller (~10 døgn).

async function fetchYr(loc, days) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${loc.lat}&lon=${loc.lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yr svarede ${res.status}`);
  const j = await res.json();
  const series = j.properties.timeseries;

  const first = series[0];
  const firstSymbol = first.data.next_1_hours?.summary.symbol_code
    ?? first.data.next_6_hours?.summary.symbol_code;
  const cur = kindFromYr(firstSymbol);

  const byDay = new Map();
  const dayOf = key => {
    if (!byDay.has(key)) byDay.set(key, { date: key, min: Infinity, max: -Infinity, precip: 0, wind: 0, pick: null });
    return byDay.get(key);
  };

  let coveredUntil = 0;
  for (const e of series) {
    const t = new Date(e.time);
    const day = dayOf(dateKey(t));
    const inst = e.data.instant.details;
    day.min = Math.min(day.min, inst.air_temperature);
    day.max = Math.max(day.max, inst.air_temperature);
    day.wind = Math.max(day.wind, inst.wind_speed ?? 0);

    // Nedbør: brug 1-times-værdier hvor de findes, ellers 6-timers — uden at tælle dobbelt.
    if (t.getTime() >= coveredUntil) {
      if (e.data.next_1_hours) {
        day.precip += e.data.next_1_hours.details.precipitation_amount ?? 0;
        coveredUntil = t.getTime() + 3600e3;
      } else if (e.data.next_6_hours) {
        day.precip += e.data.next_6_hours.details.precipitation_amount ?? 0;
        coveredUntil = t.getTime() + 6 * 3600e3;
      }
    }

    // Dagens symbol: 6-timers-symbolet nærmest middag (som yr.no gør det)
    const sym6 = e.data.next_6_hours?.summary.symbol_code;
    if (sym6) {
      const dist = Math.abs(localHour(t) - 12);
      if (!day.pick || dist < day.pick.dist) day.pick = { dist, sym: sym6 };
    }
  }

  const out = [...byDay.values()]
    .filter(d => d.pick)
    .slice(0, days)
    .map(d => ({
      date: d.date,
      min: d.min,
      max: d.max,
      precip: Math.round(d.precip * 10) / 10,
      wind: d.wind,
      kind: kindFromYr(d.pick.sym).kind,
    }));

  return {
    source: 'yr',
    fetchedAt: Date.now(),
    current: {
      temp: first.data.instant.details.air_temperature,
      feels: null,
      wind: first.data.instant.details.wind_speed,
      kind: cur.kind,
      night: cur.night,
    },
    days: out,
  };
}

const FETCHERS = { dmi: fetchDmi, yr: fetchYr };

/**
 * Henter vejr for kilden. Bruger gemt kopi hvis den er frisk nok,
 * og falder tilbage til gemt (evt. gammel) kopi hvis nettet fejler.
 */
export async function getWeather(source, { force = false } = {}) {
  const cacheKey = `weather:${source}`;
  const cached = store.get(cacheKey);
  const maxAge = CONFIG.weather.refreshMinutes * 60e3;

  if (!force && cached && Date.now() - cached.fetchedAt < maxAge) {
    return { data: cached, stale: false };
  }
  try {
    const data = await FETCHERS[source](CONFIG.location, CONFIG.weather.days);
    store.set(cacheKey, data);
    return { data, stale: false };
  } catch (err) {
    console.warn('[vejr]', source, err);
    if (cached) return { data: cached, stale: true, error: err };
    throw err;
  }
}
