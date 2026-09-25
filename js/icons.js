// Egne vejrikoner (inline SVG) + fælles vejr-"typer" for DMI og Yr.
//
// Typer: clear, fair, partly, cloudy, fog, drizzle, lightrain, rain, heavyrain,
//        showers, sleet, snow, thunder

export const DESCRIPTIONS = {
  clear: 'Klart',
  fair: 'Let skyet',
  partly: 'Delvist skyet',
  cloudy: 'Overskyet',
  fog: 'Tåge',
  drizzle: 'Støvregn',
  lightrain: 'Let regn',
  rain: 'Regn',
  heavyrain: 'Kraftig regn',
  showers: 'Byger',
  sleet: 'Slud',
  snow: 'Sne',
  thunder: 'Torden',
};

/** WMO-vejrkode (Open-Meteo / DMI) -> type */
export function kindFromWmo(code) {
  if (code === 0) return 'clear';
  if (code === 1) return 'fair';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code === 56 || code === 57 || code === 66 || code === 67) return 'sleet';
  if (code === 61) return 'lightrain';
  if (code === 63) return 'rain';
  if (code === 65 || code === 82) return 'heavyrain';
  if (code === 80 || code === 81) return 'showers';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}

/** Yr symbol_code (fx 'lightrainshowers_day') -> { kind, night } */
export function kindFromYr(symbol = '') {
  const night = symbol.endsWith('_night');
  const base = symbol.replace(/_(day|night|polartwilight)$/, '');
  let kind = 'cloudy';
  if (base.includes('thunder')) kind = 'thunder';
  else if (base.includes('snow')) kind = 'snow';
  else if (base.includes('sleet')) kind = 'sleet';
  else if (base.startsWith('heavyrain')) kind = 'heavyrain';
  else if (base === 'lightrainshowers' || base === 'rainshowers' || base === 'heavyrainshowers') kind = 'showers';
  else if (base.startsWith('lightrain')) kind = 'lightrain';
  else if (base.startsWith('rain')) kind = 'rain';
  else if (base === 'clearsky') kind = 'clear';
  else if (base === 'fair') kind = 'fair';
  else if (base === 'partlycloudy') kind = 'partly';
  else if (base === 'fog') kind = 'fog';
  return { kind, night };
}

// ---------- tegning ----------

const CLOUD = 'M17 50h31a10 10 0 0 0 1.5-19.9A14.5 14.5 0 0 0 21.6 27.4 11.4 11.4 0 0 0 17 50z';

function sun(cx, cy, r) {
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (r + 4), y1 = cy + Math.sin(a) * (r + 4);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    rays.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`);
  }
  return `<g class="wi-sun"><circle cx="${cx}" cy="${cy}" r="${r}"/><g class="wi-rays">${rays.join('')}</g></g>`;
}

function moon(cx, cy, r) {
  // halvmåne: stor cirkel minus forskudt cirkel
  return `<path class="wi-moon" d="M${cx + r * 0.35} ${cy - r}a${r} ${r} 0 1 0 ${r * 0.65} ${r * 1.55} ${r * 0.8} ${r * 0.8} 0 0 1 -${r * 0.65} -${r * 1.55}z"/>`;
}

function cloud(tx = 0, ty = 0, s = 1, cls = 'wi-cloud') {
  return `<path class="${cls}" transform="translate(${tx} ${ty}) scale(${s})" d="${CLOUD}"/>`;
}

function drops(n, heavy = false) {
  const xs = n === 1 ? [32] : n === 2 ? [26, 38] : [22, 32, 42];
  const len = heavy ? 9 : 6;
  return `<g class="wi-rain">${xs.map(x => `<line x1="${x}" y1="53" x2="${x - 3}" y2="${53 + len}"/>`).join('')}</g>`;
}

function flakes() {
  return `<g class="wi-snow">${[22, 32, 42].map((x, i) => `<circle cx="${x}" cy="${56 + (i % 2) * 3}" r="2.4"/>`).join('')}</g>`;
}

function celestial(night, cx, cy, r) {
  return night ? moon(cx, cy, r * 0.95) : sun(cx, cy, r);
}

export function weatherIcon(kind, night = false, label = '') {
  let body;
  switch (kind) {
    case 'clear':
      body = night ? moon(34, 30, 16) : sun(32, 32, 12);
      break;
    case 'fair':
      body = celestial(night, 26, 24, 11) + cloud(10, 10, 0.72);
      break;
    case 'partly':
      body = celestial(night, 22, 20, 10) + cloud(2, 2, 0.95);
      break;
    case 'cloudy':
      body = cloud(-8, -2, 0.8, 'wi-cloud wi-cloud-back') + cloud(2, 2, 0.95);
      break;
    case 'fog':
      body = cloud(0, -6, 0.9) +
        `<g class="wi-fog"><line x1="14" y1="52" x2="50" y2="52"/><line x1="18" y1="58" x2="46" y2="58"/></g>`;
      break;
    case 'drizzle':
      body = cloud(0, -6, 0.95) + drops(2);
      break;
    case 'lightrain':
      body = cloud(0, -6, 0.95) + drops(2);
      break;
    case 'rain':
      body = cloud(0, -6, 0.95) + drops(3);
      break;
    case 'heavyrain':
      body = cloud(0, -6, 0.95, 'wi-cloud wi-cloud-dark') + drops(3, true);
      break;
    case 'showers':
      body = celestial(night, 22, 16, 9) + cloud(2, -4, 0.92) + drops(2);
      break;
    case 'sleet':
      body = cloud(0, -6, 0.95) +
        `<g class="wi-rain"><line x1="24" y1="53" x2="21" y2="59"/><line x1="40" y1="53" x2="37" y2="59"/></g>` +
        `<g class="wi-snow"><circle cx="32" cy="57" r="2.4"/></g>`;
      break;
    case 'snow':
      body = cloud(0, -6, 0.95) + flakes();
      break;
    case 'thunder':
      body = cloud(0, -6, 0.95, 'wi-cloud wi-cloud-dark') +
        `<path class="wi-bolt" d="M34 44l-8 11h6l-3 9 10-13h-6l3-7z"/>`;
      break;
    default:
      body = cloud(2, 2, 0.95);
  }
  const title = label || DESCRIPTIONS[kind] || '';
  return `<svg class="wi" viewBox="0 0 64 64" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>`;
}
