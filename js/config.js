// Samlet opsætning for Familie-Portalen.
// Steder man kan skifte mellem (øverst ved uret). Koordinater: højst 4 decimaler (met.no).
export const LOCATIONS = [
  { id: 'hjem',      label: 'Hjemme',    icon: '🏠', name: 'Hornslet',        lat: 56.3183, lon: 10.3203 },
  { id: 'sommerhus', label: 'Sommerhus', icon: '🏖️', name: 'Dragsmur Strand', lat: 56.1698, lon: 10.5352 },   // samme punkt som Yr (2-11102451)
];

function savedLocation() {
  try { return LOCATIONS.find(l => l.id === JSON.parse(localStorage.getItem('location'))) ?? LOCATIONS[0]; }
  catch { return LOCATIONS[0]; }
}

export const CONFIG = {
  location: savedLocation(),   // aktuelt sted (skiftes med setLocation)
  weather: {
    defaultSource: 'dmi',   // 'dmi' eller 'yr'
    days: 9,                // antal dage i vejrstriben på stor skærm
    refreshMinutes: 30,     // hvor ofte vejret hentes igen
  },
  supabase: {
    // Offentlige værdier — det er RLS i databasen, der beskytter data.
    // Læg ALDRIG service_role / secret-nøglen her.
    url: 'https://medrurmerfdulasjeenb.supabase.co',
    key: 'sb_publishable_5yClfPCYNz4cfXbZLzVHAA_XmKNDzwJ',
  },
  kiosk: {
    backToThisWeekSeconds: 120,  // ugekalenderen går tilbage til denne uge
  },
  locale: 'da-DK',
  timeZone: 'Europe/Copenhagen',
};

/** Skift sted på denne enhed (huskes) */
export function setLocation(id) {
  const loc = LOCATIONS.find(l => l.id === id);
  if (!loc) return;
  CONFIG.location = loc;
  try { localStorage.setItem('location', JSON.stringify(id)); } catch { /* ignore */ }
}
