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

// UV-indeks findes ikke i DMI-modellen, så det hentes separat (Open-Meteo's standardmodel).
async function fetchUv(loc, days) {
  try {
    const p = new URLSearchParams({ latitude: loc.lat, longitude: loc.lon, daily: 'uv_index_max', timezone: CONFIG.timeZone, forecast_days: String(days) });
    const j = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`).then(r => r.json());
    return new Map(j.daily.time.map((d, i) => [d, j.daily.uv_index_max[i]]));
  } catch { return new Map(); }
}

async function fetchDmi(loc, days) {
  const uvP = fetchUv(loc, days);
  const p = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    models: 'dmi_seamless',
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
    hourly: 'temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,wind_direction_10m,relative_humidity_2m,is_day',
    wind_speed_unit: 'ms',
    timezone: CONFIG.timeZone,
    forecast_days: String(days),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${p}`);
  if (!res.ok) throw new Error(`DMI/Open-Meteo svarede ${res.status}`);
  const j = await res.json();
  const c = j.current;
  const d = j.daily;
  const h = j.hourly;
  const uv = await uvP;
  const hours = h.time.map((t, i) => ({
    time: new Date(t).toISOString(),   // lokal tid fra API'et → ISO
    step: 1,
    temp: h.temperature_2m[i],
    feels: h.apparent_temperature[i],
    kind: kindFromWmo(h.weather_code[i]),
    night: h.is_day[i] === 0,
    precip: h.precipitation[i],
    wind: h.wind_speed_10m[i],
    gust: h.wind_gusts_10m[i],
    dir: h.wind_direction_10m[i],
    humidity: h.relative_humidity_2m[i],
  })).filter(x => x.temp !== null);
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
      uv: uv.get(date) ?? null,
    })).filter(x => x.max !== null),
    hours,
  };
}

// ---------- Yr / MET Norway ----------
// Locationforecast 2.0 compact. Browseren sender selv User-Agent/Origin.
// Timevise data de første ~2,5 døgn, derefter 6-timers intervaller (~10 døgn).

async function fetchYr(loc, days) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${loc.lat}&lon=${loc.lon}`;
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
    if (!byDay.has(key)) byDay.set(key, { date: key, min: Infinity, max: -Infinity, precip: 0, wind: 0, uv: 0, pick: null });
    return byDay.get(key);
  };

  const hours = [];
  let coveredUntil = 0;
  for (const e of series) {
    const t = new Date(e.time);
    const day = dayOf(dateKey(t));
    const inst = e.data.instant.details;
    day.min = Math.min(day.min, inst.air_temperature);
    day.max = Math.max(day.max, inst.air_temperature);
    const n6 = e.data.next_6_hours?.details;
    if (n6?.air_temperature_max != null) day.max = Math.max(day.max, n6.air_temperature_max);
    if (n6?.air_temperature_min != null) day.min = Math.min(day.min, n6.air_temperature_min);
    day.wind = Math.max(day.wind, inst.wind_speed ?? 0);
    day.uv = Math.max(day.uv, inst.ultraviolet_index_clear_sky ?? 0);

    // Time for time (de første ~2½ døgn), derefter 6-timers blokke
    const nx = e.data.next_1_hours ?? e.data.next_6_hours;
    if (nx) {
      const k = kindFromYr(nx.summary.symbol_code);
      hours.push({
        time: t.toISOString(),
        step: e.data.next_1_hours ? 1 : 6,
        temp: inst.air_temperature,
        feels: inst.apparent_air_temperature ?? null,
        kind: k.kind,
        night: k.night,
        precip: nx.details?.precipitation_amount ?? 0,
        wind: inst.wind_speed,
        gust: inst.wind_speed_of_gust ?? null,
        dir: inst.wind_from_direction,
        humidity: inst.relative_humidity,
      });
    }

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
      uv: d.uv ? Math.round(d.uv * 10) / 10 : null,
    }));

  return {
    source: 'yr',
    fetchedAt: Date.now(),
    current: {
      temp: first.data.instant.details.air_temperature,
      feels: first.data.instant.details.apparent_air_temperature ?? null,
      wind: first.data.instant.details.wind_speed,
      kind: cur.kind,
      night: cur.night,
    },
    days: out,
    hours,
  };
}

const FETCHERS = { dmi: fetchDmi, yr: fetchYr };

/**
 * Henter vejr for kilden. Bruger gemt kopi hvis den er frisk nok,
 * og falder tilbage til gemt (evt. gammel) kopi hvis nettet fejler.
 */
export async function getWeather(source, { force = false } = {}) {
  const cacheKey = `weather:${source}:${CONFIG.location.id ?? 'hjem'}`;
  const cached = store.get(cacheKey);
  const maxAge = CONFIG.weather.refreshMinutes * 60e3;

  if (!force && cached?.hours && Date.now() - cached.fetchedAt < maxAge) {
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
