# Familie-Portal (info_app)

Infoskærm / PWA til familien. Ren HTML, CSS og JavaScript, uden en server, du selv skal drive.

## Kør lokalt
Start Apache i XAMPP og åbn <http://localhost/info_app/>.
(Siden skal åbnes via `http://`, ikke ved at dobbeltklikke på `index.html`, fordi JavaScript-modulerne ellers ikke indlæses.)

## Filer
| Fil | Indhold |
|---|---|
| `index.html` | Sidens opbygning: top (tid + vejr), midte (uge + i dag), bund (lister) |
| `css/style.css` | Layout: infoskærm (landscape ≥ 900 px, ingen scroll), tablet på højkant og mobil |
| `js/config.js` | **Indstillinger**: by, koordinater, standard-vejrkilde, antal dage |
| `js/weather.js` | Henter vejr fra DMI (Open-Meteo, model `dmi_seamless`) og Yr (api.met.no) |
| `js/icons.js` | Egne vejrikoner + oversættelse af DMI/Yr-vejrkoder |
| `js/db.js` | Supabase: login, kalender, lister og realtid |
| `js/vendor/supabase.js` | Supabase-biblioteket (v2), lagt lokalt så appen ikke afhænger af et CDN |
| `supabase/01_schema.sql` | Tabeller, sikkerhedsregler (RLS) og realtid. Køres i Supabase → SQL Editor |
| `supabase/02_members.sql` | Knytter brugerkonti til familien (navn, farve) |
| `js/app.js` | Ur, visning, ugeskift, lister, skærmlås-forhindring, fuld skærm |
| `sw.js`, `manifest.webmanifest`, `icons/` | Gør appen installerbar (PWA) |

## Supabase-opsætning
1. SQL Editor → kør `supabase/01_schema.sql`.
2. Authentication → Sign In / Providers → slå **Allow new users to sign up** fra.
3. Authentication → Users → **Add user** for hver person + én fælles konto til infoskærmen (sæt "Auto Confirm User").
4. Ret e-mails/navne/farver i `supabase/02_members.sql` og kør den.

Kun konti i tabellen `members` kan se eller ændre noget. Private aftaler og personlige lister ses kun af ejeren.

## Vejr
- **DMI**: DMI HARMONIE de første ~2½ døgn, derefter ECMWF (via Open-Meteo, gratis, ingen nøgle).
- **YR**: MET Norway Locationforecast 2.0 (gratis, ingen nøgle).
- Skift kilde med knappen **DMI | YR**. Valget huskes på den enkelte enhed.
- Vejret hentes hver 30. minut og gemmes lokalt, så det sidst hentede vises, hvis nettet er nede.

## Infoskærm-tips
- Knappen i nederste højre hjørne skifter til fuld skærm.
- Skærmen holdes tændt (Wake Lock), hvor browseren understøtter det.
- Ugekalenderen går selv tilbage til denne uge 2 minutter efter, man har bladret.
- Når filer ændres, skal `VERSION` i `sw.js` hæves, så installerede enheder henter de nye.
