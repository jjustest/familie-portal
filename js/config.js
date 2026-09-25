// Samlet opsætning for Familie-Portalen.
export const CONFIG = {
  location: {
    name: 'Hornslet',
    lat: 56.3183,   // met.no ønsker højst 4 decimaler
    lon: 10.3203,
  },
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
