import { CONFIG } from './config.js';
import { getWeather, SOURCES } from './weather.js';
import { weatherIcon, DESCRIPTIONS } from './icons.js';
import * as realDb from './db.js';
import { updateSky, sunInfo, isNight } from './sky.js';
import { createDemoApi } from './demo.js';
import {
  addDays, dateKey, esc, fmt, fromKey, isoWeek, store, timeHM,
} from './util.js';

// ?demo i adressen = forhåndsvisning med eksempeldata (intet gemmes)
const DEMO = new URLSearchParams(location.search).has('demo');
const db = DEMO ? createDemoApi() : realDb;

const $ = sel => document.querySelector(sel);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

const state = {
  source: store.get('weatherSource', CONFIG.weather.defaultSource),
  weekOffset: 0,          // 0 = i dag + 6 dage frem, 1 = de næste 7 osv.
  weather: null,
  session: null,
  me: null,               // række fra members for den indloggede
  members: DEMO ? [] : store.get('cache:members', []),
  events: DEMO ? [] : store.get('cache:events', []),
  lists: DEMO ? [] : store.get('cache:lists', []),
  range: null,            // {from, to} for de hentede aftaler
};

// ================= Små hjælpere =================

function toast(msg, kind = 'error') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = 'toast'; }, 4000);
}

function fail(err, what) {
  console.error(what, err);
  const offline = !navigator.onLine || /fetch|network/i.test(err?.message ?? '');
  toast(offline ? `${what}: ingen forbindelse` : `${what}: ${err?.message ?? err}`);
}

function member(id) {
  return state.members.find(m => m.user_id === id) ?? null;
}

function personColor(id) {
  return member(id)?.color ?? 'var(--c-faelles)';
}

function personName(id) {
  return member(id)?.name ?? 'Fælles';
}

// ================= Ur & dato =================

function renderClock() {
  const now = new Date();
  $('#clock').textContent = timeHM(now).replace('.', ':');
  const h = now.getHours();
  $('#greeting').textContent =
    h < 5 ? 'God nat' : h < 10 ? 'God morgen' : h < 12 ? 'God formiddag' :
    h < 18 ? 'God eftermiddag' : h < 23 ? 'God aften' : 'God nat';
  if (now.getSeconds() === 0) updateSky(state.weather?.data.current.kind ?? 'partly', now);
  $('#date').textContent = cap(fmt(now, { weekday: 'long', day: 'numeric', month: 'long' }));
  $('#week-no').textContent = `Uge ${isoWeek(now)}`;
}

function startClock() {
  renderClock();
  let lastDay = dateKey(new Date());
  setTimeout(() => {
    renderClock();
    setInterval(() => {
      renderClock();
      const today = dateKey(new Date());
      if (today !== lastDay) {           // midnat
        lastDay = today;
        state.weekOffset = 0;
        refreshEvents();
        loadWeather(true);
      }
    }, 1000);
  }, 1000 - (Date.now() % 1000));
}

// ================= Vejr =================

const r0 = n => (n === null || n === undefined || Number.isNaN(n)) ? '–' : Math.round(n);
const mm = n => n.toFixed(1).replace('.', ',');

function renderSourceToggle() {
  document.querySelectorAll('[data-source]').forEach(btn => {
    const on = btn.dataset.source === state.source;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}

// Temperatur -> farve (koldt blå, lunt gul, varmt rød)
function tempColor(t) {
  const stops = [[-10, [120, 170, 255]], [0, [140, 210, 255]], [8, [120, 230, 200]],
    [15, [255, 220, 110]], [22, [255, 160, 80]], [30, [255, 95, 80]]];
  if (t <= stops[0][0]) return `rgb(${stops[0][1]})`;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k))})`;
    }
  }
  return `rgb(${stops.at(-1)[1]})`;
}

function renderWeather({ data, stale }) {
  const { current: c, days } = data;
  const today = days[0];
  const todayKey = dateKey(new Date());
  const sun = sunInfo();

  $('#wx-now').innerHTML = `
    <div class="wx-now-icon">${weatherIcon(c.kind, isNight())}</div>
    <div class="wx-now-text">
      <div class="wx-now-temp">${r0(c.temp)}°</div>
      <div class="wx-now-desc">${DESCRIPTIONS[c.kind] ?? ''}${c.feels != null ? ` · føles som ${r0(c.feels)}°` : ''}</div>
      <div class="wx-now-meta">
        ${today ? `<span>↑ ${r0(today.max)}°  ↓ ${r0(today.min)}°</span>` : ''}
        <span>${r0(c.wind)} m/s</span>
        ${today && today.precip > 0 ? `<span>${mm(today.precip)} mm</span>` : ''}
        <span>☀ ${timeHM(sun.sunrise)} – ${timeHM(sun.sunset)}</span>
      </div>
    </div>`;

  const lo = Math.min(...days.map(d => d.min));
  const hi = Math.max(...days.map(d => d.max));
  const span = Math.max(1, hi - lo);
  $('#wx-days').innerHTML = days.map(d => {
    const label = d.date === todayKey ? 'I dag' : cap(fmt(fromKey(d.date), { weekday: 'short' }).replace('.', ''));
    const top = ((hi - d.max) / span) * 100;
    const height = Math.max(6, ((d.max - d.min) / span) * 100);
    return `
      <li class="wx-day${d.date === todayKey ? ' is-today' : ''}">
        <span class="wx-day-name">${label}</span>
        ${weatherIcon(d.kind, false)}
        <span class="wx-day-max">${r0(d.max)}°</span>
        <span class="wx-range"><i style="top:${top}%;height:${height}%;--t-hi:${tempColor(d.max)};--t-lo:${tempColor(d.min)}"></i></span>
        <span class="wx-day-min">${r0(d.min)}°</span>
        <span class="wx-day-rain">${d.precip >= 0.1 ? mm(d.precip) + ' mm' : ''}</span>
      </li>`;
  }).join('');

  const src = SOURCES[data.source];
  $('#wx-credit').innerHTML =
    `Vejr: <a href="${src.link}" target="_blank" rel="noopener">${src.credit}</a> · ${timeHM(new Date(data.fetchedAt))}` +
    (stale ? ' · <span class="warn">offline – viser gemte data</span>' : '');
  $('#weather').classList.remove('is-loading', 'is-error');
  updateSky(c.kind);
  renderWeek(); // vejr i kalenderens dagsoverskrifter
}

async function loadWeather(force = false) {
  const src = state.source;
  try {
    const result = await getWeather(src, { force });
    if (src === state.source) { state.weather = result; renderWeather(result); }
  } catch {
    if (src !== state.source) return;
    $('#weather').classList.add('is-error');
    $('#wx-credit').innerHTML = `<span class="warn">Kunne ikke hente vejr fra ${SOURCES[src].label}.</span>`;
  }
}

function initWeather() {
  renderSourceToggle();
  document.querySelectorAll('[data-source]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.source === btn.dataset.source) return;
      state.source = btn.dataset.source;
      store.set('weatherSource', state.source);
      renderSourceToggle();
      loadWeather();
    });
  });
  loadWeather();
  setInterval(() => loadWeather(true), CONFIG.weather.refreshMinutes * 60e3);
}

// ================= Kalender: data =================

function firstDay() {
  return addDays(fromKey(dateKey(new Date())), state.weekOffset * 7);
}

function neededRange() {
  const now = new Date();
  const start = firstDay();
  const today = fromKey(dateKey(now));
  const from = new Date(Math.min(start, today));
  const to = new Date(Math.max(addDays(start, 7), addDays(today, 3)));
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);
  return { from, to };
}

async function refreshEvents() {
  if (!state.me) return;
  const range = neededRange();
  try {
    state.events = await db.loadEvents(range.from, range.to);
    state.range = range;
    if (state.weekOffset === 0 && !DEMO) store.set('cache:events', state.events);
  } catch (err) {
    fail(err, 'Kalender');
  }
  renderCalendar();
}

function dayKeyOf(iso) {
  return dateKey(new Date(iso));
}

/** Aftaler der ligger på dagen `key` (også flerdagsaftaler) */
function eventsOn(key) {
  return state.events
    .filter(ev => {
      const s = dayKeyOf(ev.starts_at);
      // slut er "til og med" for tidsaftaler, "til" (eksklusiv) for heldagsaftaler
      const e = dayKeyOf(new Date(new Date(ev.ends_at).getTime() - (ev.all_day ? 1 : 0)).toISOString());
      return s <= key && key <= e;
    })
    .sort((a, b) => {
      const aAll = a.all_day || dayKeyOf(a.starts_at) < key;
      const bAll = b.all_day || dayKeyOf(b.starts_at) < key;
      if (aAll !== bAll) return aAll ? -1 : 1;
      return a.starts_at.localeCompare(b.starts_at);
    });
}

function evTimeLabel(ev, key) {
  if (ev.all_day) return 'Hele dagen';
  if (dayKeyOf(ev.starts_at) < key) return 'Fortsat';
  return timeHM(new Date(ev.starts_at));
}

// ================= Kalender: visning =================

function dayLabel(day, todayKey) {
  const key = dateKey(day);
  if (key === todayKey) return 'I dag';
  if (key === dateKey(addDays(fromKey(todayKey), 1))) return 'I morgen';
  return cap(fmt(day, { weekday: 'long' }));
}

function renderWeek() {
  const now = new Date();
  const start = firstDay();
  const todayKey = dateKey(now);
  const end = addDays(start, 6);
  const wxByDay = new Map((state.weather?.data.days ?? []).map(d => [d.date, d]));

  $('#week-title').textContent = state.weekOffset === 0
    ? 'Næste 7 dage'
    : `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short' })}`;
  $('#week-today').hidden = state.weekOffset === 0;
  $('#week-prev').disabled = state.weekOffset <= -8;

  let html = '';
  for (let i = 0; i < 7; i++) {
    const day = addDays(start, i);
    const key = dateKey(day);
    const evs = eventsOn(key);
    const wx = wxByDay.get(key);
    const dow = day.getDay();
    html += `
      <section class="day${key === todayKey ? ' is-today' : ''}${key < todayKey ? ' is-past' : ''}${dow === 0 || dow === 6 ? ' is-weekend' : ''}" data-day="${key}">
        <header class="day-head">
          <span class="day-name">${dayLabel(day, todayKey)}</span>
          <span class="day-date">${fmt(day, { day: 'numeric', month: 'short' })}</span>
          ${wx ? `<span class="day-wx" title="${DESCRIPTIONS[wx.kind] ?? ''}">${weatherIcon(wx.kind)}<span><b>${r0(wx.max)}°</b> ${r0(wx.min)}°</span></span>` : ''}
        </header>
        <ul class="day-events">
          ${evs.map(ev => `
            <li class="ev${ev.all_day ? ' ev-allday' : ''}${ev.is_private ? ' ev-private' : ''}" data-ev="${ev.id}" style="--ev:${personColor(ev.person_id)}" tabindex="0">
              ${ev.all_day ? '' : `<span class="ev-time">${evTimeLabel(ev, key)}${ev.person_id ? ` · ${esc(personName(ev.person_id))}` : ''}</span>`}
              <span class="ev-title">${ev.is_private ? '🔒 ' : ''}${esc(ev.title)}</span>
            </li>`).join('')}
          ${evs.length ? '' : '<li class="day-empty">Fri</li>'}
        </ul>
        <button type="button" class="day-add" data-add-day="${key}" aria-label="Ny aftale ${key}">+ Tilføj</button>
      </section>`;
  }
  $('#week-grid').innerHTML = html;
}

function relTime(ms) {
  const min = Math.round(ms / 60e3);
  if (min < 1) return 'Nu';
  if (min < 60) return `Om ${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 12) return m ? `Om ${h} t ${m} min` : `Om ${h} t`;
  return null;
}

function renderNextUp() {
  const el = $('#next-up');
  const now = new Date();
  const todayKey = dateKey(now);
  const upcoming = state.events
    .filter(ev => !ev.all_day && new Date(ev.ends_at) > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const ev = upcoming[0];
  el.hidden = false;
  el.className = 'next-up';
  if (!ev) {
    el.classList.add('is-free');
    el.removeAttribute('data-ev');
    el.style.removeProperty('--ev');
    el.innerHTML = `<div class="next-label">Næste</div><div class="next-when">Ingen planer</div><div class="next-meta">Nyd det ✨</div>`;
    return;
  }
  const start = new Date(ev.starts_at);
  const end = new Date(ev.ends_at);
  const running = start <= now;
  const key = dateKey(start);
  let when;
  if (running) when = 'Nu';
  else when = relTime(start - now) ?? (key === todayKey ? timeHM(start) : `${dayLabel(start, todayKey)} ${timeHM(start)}`);
  if (running) el.classList.add('is-now');
  el.dataset.ev = ev.id;
  el.style.setProperty('--ev', personColor(ev.person_id));
  el.innerHTML = `
    <div class="next-label">${running ? 'I gang' : 'Næste'}</div>
    <div class="next-when">${when}</div>
    <div class="next-title">${ev.is_private ? '🔒 ' : ''}${esc(ev.title)}</div>
    <div class="next-meta"><span class="dot" style="--dot:${personColor(ev.person_id)}"></span>${esc(personName(ev.person_id))} · ${timeHM(start)}–${timeHM(end)}${running ? ` · slutter ${timeHM(end)}` : ''}</div>`;
}

function renderToday() {
  const now = new Date();
  const key = dateKey(now);
  const evs = eventsOn(key);
  const el = $('#today-list');
  if (!evs.length) {
    el.innerHTML = '<li class="empty">Ingen aftaler i dag 🎉</li>';
    return;
  }
  let nowMarked = false;
  el.innerHTML = evs.map(ev => {
    const start = new Date(ev.starts_at);
    const end = new Date(ev.ends_at);
    const past = !ev.all_day && end < now;
    const active = !ev.all_day && start <= now && now < end;
    let marker = '';
    if (!nowMarked && !ev.all_day && !past && dayKeyOf(ev.starts_at) === key) {
      nowMarked = true;
      marker = `<li class="now-line" aria-hidden="true"><span>${timeHM(now)}</span></li>`;
    }
    const time = ev.all_day
      ? 'Hele dagen'
      : dayKeyOf(ev.starts_at) < key
        ? `Fortsat<small>–${timeHM(end)}</small>`
        : `${timeHM(start)}<small>–${timeHM(end)}</small>`;
    return `${marker}
      <li class="today-ev${past ? ' is-past' : ''}${active ? ' is-active' : ''}" data-ev="${ev.id}" tabindex="0">
        <span class="today-time">${time}</span>
        <span class="today-body">
          <span class="today-title">${ev.is_private ? '🔒 ' : ''}${esc(ev.title)}</span>
          <span class="today-who"><span class="dot" style="--dot:${personColor(ev.person_id)}"></span>${esc(personName(ev.person_id))}</span>
        </span>
      </li>`;
  }).join('');
}

function renderAgenda() {
  const now = new Date();
  let html = '';
  for (let i = 0; i < 3; i++) {
    const day = addDays(fromKey(dateKey(now)), i);
    const key = dateKey(day);
    const evs = eventsOn(key);
    const label = i === 0 ? 'I dag' : i === 1 ? 'I morgen' : cap(fmt(day, { weekday: 'long' }));
    html += `
      <section class="agenda-day">
        <h3>${label} <small>${fmt(day, { day: 'numeric', month: 'long' })}</small>
          <button type="button" class="day-add" data-add-day="${key}" aria-label="Ny aftale">+</button></h3>
        <ul>
          ${evs.length ? evs.map(ev => `
            <li data-ev="${ev.id}" style="--ev:${personColor(ev.person_id)}" tabindex="0">
              <span class="ev-time">${evTimeLabel(ev, key)}</span>
              <span class="ev-title">${ev.is_private ? '🔒 ' : ''}${esc(ev.title)}</span>
            </li>`).join('') : '<li class="empty">Ingen aftaler</li>'}
        </ul>
      </section>`;
  }
  $('#agenda').innerHTML = html;
}

function renderCalendar() {
  renderWeek();
  renderNextUp();
  renderToday();
  renderAgenda();
}

async function changeWeek(delta) {
  state.weekOffset = delta === 0 ? 0 : state.weekOffset + delta;
  renderWeek();
  const r = neededRange();
  if (!state.range || r.from < state.range.from || r.to > state.range.to) await refreshEvents();
}

// ================= Kalender: aftale-dialog =================

const pad = n => String(n).padStart(2, '0');
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openEventDialog(ev = null, dayKey = null) {
  const dlg = $('#event-dialog');
  const f = dlg.querySelector('form');
  f.reset();
  f.dataset.id = ev?.id ?? '';
  dlg.querySelector('h2').textContent = ev ? 'Ret aftale' : 'Ny aftale';

  // personer
  f.person_id.innerHTML = '<option value="">Fælles</option>' +
    state.members.filter(m => !m.is_shared)
      .map(m => `<option value="${m.user_id}">${esc(m.name)}</option>`).join('');

  let start, end;
  if (ev) {
    start = new Date(ev.starts_at);
    end = new Date(ev.ends_at);
    if (ev.all_day) end = new Date(end.getTime() - 1);
  } else {
    const base = dayKey ? fromKey(dayKey) : new Date();
    start = new Date(base);
    const nowH = new Date().getHours() + 1;
    start.setHours(dayKey && dayKey !== dateKey(new Date()) ? 16 : Math.min(nowH, 23), 0, 0, 0);
    end = new Date(start.getTime() + 3600e3);
  }

  f.title.value = ev?.title ?? '';
  f.date.value = dateKey(start);
  f.end_date.value = dateKey(end);
  f.all_day.checked = ev?.all_day ?? false;
  f.start.value = hm(start);
  f.end.value = hm(end);
  f.person_id.value = ev?.person_id ?? '';
  f.is_private.checked = ev?.is_private ?? false;
  f.note.value = ev?.note ?? '';
  syncAllDay(f);

  const del = dlg.querySelector('[data-action=delete]');
  del.hidden = !ev;
  del.textContent = 'Slet';
  del.classList.remove('confirm');

  dlg.showModal();
  if (!ev) f.title.focus();
}

function syncAllDay(f) {
  f.classList.toggle('is-allday', f.all_day.checked);
  f.start.required = !f.all_day.checked;
  f.end.required = !f.all_day.checked;
}

function localDate(key, time = '00:00') {
  const [y, m, d] = key.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

function initEventDialog() {
  const dlg = $('#event-dialog');
  const f = dlg.querySelector('form');

  f.all_day.addEventListener('change', () => syncAllDay(f));
  // flyt slutdato med, hvis startdatoen flyttes forbi den
  f.date.addEventListener('change', () => {
    if (!f.end_date.value || f.end_date.value < f.date.value) f.end_date.value = f.date.value;
  });
  f.start.addEventListener('change', () => {
    if (f.date.value === f.end_date.value && f.end.value <= f.start.value) {
      const s = localDate(f.date.value, f.start.value);
      f.end.value = hm(new Date(s.getTime() + 3600e3));
    }
  });

  dlg.querySelector('[data-action=cancel]').addEventListener('click', () => dlg.close());

  dlg.querySelector('[data-action=delete]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Tryk igen for at slette';
      return;
    }
    try {
      await db.deleteEvent(f.dataset.id);
      dlg.close();
      await refreshEvents();
    } catch (err) { fail(err, 'Kunne ikke slette'); }
  });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const allDay = f.all_day.checked;
    const endKey = f.end_date.value || f.date.value;
    let starts, ends;
    if (allDay) {
      starts = localDate(f.date.value);
      ends = addDays(localDate(endKey), 1);   // eksklusiv slut
      ends.setHours(0, 0, 0, 0);
    } else {
      starts = localDate(f.date.value, f.start.value);
      ends = localDate(endKey, f.end.value);
    }
    if (ends < starts) { toast('Slut skal være efter start'); return; }
    const saveBtn = f.querySelector('[type=submit]');
    saveBtn.disabled = true;
    try {
      await db.saveEvent({
        id: f.dataset.id || null,
        title: f.title.value.trim(),
        starts_at: starts.toISOString(),
        ends_at: ends.toISOString(),
        all_day: allDay,
        person_id: f.person_id.value || null,
        is_private: f.is_private.checked,
        note: f.note.value.trim(),
      });
      dlg.close();
      await refreshEvents();
    } catch (err) {
      fail(err, 'Kunne ikke gemme');
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function initCalendar() {
  $('#week-prev').addEventListener('click', () => changeWeek(-1));
  $('#week-next').addEventListener('click', () => changeWeek(1));
  $('#week-today').addEventListener('click', () => changeWeek(0));
  $('#event-add').addEventListener('click', () => openEventDialog());

  const openFromClick = e => {
    const add = e.target.closest('[data-add-day]');
    if (add) { openEventDialog(null, add.dataset.addDay); return; }
    const li = e.target.closest('[data-ev]');
    if (li) {
      const ev = state.events.find(x => x.id === li.dataset.ev);
      if (ev) openEventDialog(ev);
    }
  };
  for (const id of ['#week-grid', '#today-list', '#agenda', '#next-up']) {
    $(id).addEventListener('click', openFromClick);
    $(id).addEventListener('keydown', e => { if (e.key === 'Enter') openFromClick(e); });
  }

  initEventDialog();
  renderCalendar();
  setInterval(() => { renderToday(); renderNextUp(); }, 30e3);

  let t;
  document.addEventListener('pointerdown', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (state.weekOffset) changeWeek(0); }, CONFIG.kiosk.backToThisWeekSeconds * 1000);
  });
}

// ================= Lister =================

async function refreshLists() {
  if (!state.me) return;
  try {
    state.lists = await db.loadLists();
    if (!DEMO) store.set('cache:lists', state.lists);
  } catch (err) {
    fail(err, 'Lister');
  }
  renderLists();
}

function renderLists() {
  const focused = document.activeElement?.closest?.('[data-list]')?.dataset.list;
  const focusedValue = focused ? document.activeElement.value : '';

  $('#lists').style.setProperty('--lists', Math.max(1, state.lists.length));
  $('#lists').innerHTML = state.lists.map(list => {
    const open = list.items.filter(i => !i.done);
    const done = list.items.filter(i => i.done);
    return `
      <section class="list glass" data-list="${list.id}">
        <header class="list-head">
          <h2><span aria-hidden="true">${esc(list.icon)}</span> ${esc(list.name)}${list.owner_id ? ' <small title="Personlig liste">🔒</small>' : ''}</h2>
          <span class="count">${open.length}</span>
          <button type="button" class="list-menu" data-edit-list="${list.id}" aria-label="Indstillinger for ${esc(list.name)}">⋯</button>
        </header>
        <ul class="list-items">
          ${[...open, ...done].map(item => `
            <li class="${item.done ? 'is-done' : ''}">
              <label>
                <input type="checkbox" data-item="${item.id}" ${item.done ? 'checked' : ''}>
                <span>${esc(item.text)}</span>
              </label>
              <button type="button" class="item-del" data-del-item="${item.id}" aria-label="Slet ${esc(item.text)}">×</button>
            </li>`).join('')}
        </ul>
        <form class="list-add" autocomplete="off">
          <input type="text" name="text" maxlength="200" placeholder="Tilføj…" aria-label="Tilføj til ${esc(list.name)}" enterkeyhint="done">
        </form>
      </section>`;
  }).join('') + `
    <button type="button" class="list-new" id="list-new" aria-label="Ny liste">＋<span>Ny liste</span></button>`;

  // bevar det, man er ved at skrive, hvis listen opdateres imens
  if (focused) {
    const input = $(`[data-list="${focused}"] .list-add input`);
    if (input) { input.value = focusedValue; input.focus(); }
  }
}

function openListDialog(list = null) {
  const dlg = $('#list-dialog');
  const f = dlg.querySelector('form');
  f.reset();
  f.dataset.id = list?.id ?? '';
  dlg.querySelector('h2').textContent = list ? 'Ret liste' : 'Ny liste';
  f.name.value = list?.name ?? '';
  f.icon.value = list?.icon ?? '📝';
  f.personal.checked = !!list?.owner_id;
  const hasDone = list?.items.some(i => i.done);
  dlg.querySelector('[data-action=clear-done]').hidden = !hasDone;
  const del = dlg.querySelector('[data-action=delete]');
  del.hidden = !list;
  del.textContent = 'Slet liste';
  del.classList.remove('confirm');
  dlg.showModal();
}

function initLists() {
  const root = $('#lists');

  root.addEventListener('change', async e => {
    const box = e.target.closest('input[type=checkbox][data-item]');
    if (!box) return;
    // vis ændringen med det samme, gem bagefter
    for (const l of state.lists) {
      const it = l.items.find(i => i.id === box.dataset.item);
      if (it) it.done = box.checked;
    }
    renderLists();
    try { await db.setItemDone(box.dataset.item, box.checked); }
    catch (err) { fail(err, 'Kunne ikke gemme'); refreshLists(); }
  });

  root.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const text = form.text.value.trim();
    if (!text) return;
    const listId = form.closest('[data-list]').dataset.list;
    form.text.value = '';
    const list = state.lists.find(l => l.id === listId);
    list.items.unshift({ id: `tmp-${Date.now()}`, text, done: false, created_at: new Date().toISOString() });
    renderLists();
    $(`[data-list="${listId}"] .list-add input`)?.focus();
    try { await db.addItem(listId, text); await refreshLists(); }
    catch (err) { fail(err, 'Kunne ikke tilføje'); refreshLists(); }
  });

  root.addEventListener('click', async e => {
    const del = e.target.closest('[data-del-item]');
    if (del) {
      for (const l of state.lists) l.items = l.items.filter(i => i.id !== del.dataset.delItem);
      renderLists();
      try { await db.deleteItem(del.dataset.delItem); }
      catch (err) { fail(err, 'Kunne ikke slette'); refreshLists(); }
      return;
    }
    const edit = e.target.closest('[data-edit-list]');
    if (edit) { openListDialog(state.lists.find(l => l.id === edit.dataset.editList)); return; }
    if (e.target.closest('#list-new')) openListDialog();
  });

  // liste-dialog
  const dlg = $('#list-dialog');
  const f = dlg.querySelector('form');
  dlg.querySelector('[data-action=cancel]').addEventListener('click', () => dlg.close());
  dlg.querySelector('[data-action=clear-done]').addEventListener('click', async () => {
    try { await db.clearDone(f.dataset.id); dlg.close(); await refreshLists(); }
    catch (err) { fail(err, 'Kunne ikke rydde'); }
  });
  dlg.querySelector('[data-action=delete]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = 'Tryk igen – alt på listen slettes';
      return;
    }
    try { await db.deleteList(f.dataset.id); dlg.close(); await refreshLists(); }
    catch (err) { fail(err, 'Kunne ikke slette'); }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const existing = state.lists.find(l => l.id === f.dataset.id);
    try {
      await db.saveList({
        id: f.dataset.id || null,
        name: f.name.value.trim(),
        icon: f.icon.value.trim() || '📝',
        owner_id: f.personal.checked ? state.session.user.id : null,
        sort: existing?.sort ?? state.lists.length + 1,
      });
      dlg.close();
      await refreshLists();
    } catch (err) { fail(err, 'Kunne ikke gemme'); }
  });

  renderLists();
}

// ================= Login =================

function setSignedIn(on) {
  document.body.classList.toggle('signed-out', !on);
  $('#login').hidden = on;
}

function renderAccount() {
  const btn = $('#account');
  if (!state.session) { btn.hidden = true; return; }
  btn.hidden = false;
  const name = state.me?.name ?? state.session.user.email;
  btn.querySelector('.account-name').textContent = name;
  btn.style.setProperty('--dot', state.me?.color ?? 'var(--muted)');
}

async function afterLogin(session) {
  state.session = session;
  try {
    state.members = await db.loadMembers();
    if (!DEMO) store.set('cache:members', state.members);
  } catch (err) {
    // offline: brug gemt liste
    if (!state.members.length) { fail(err, 'Login'); }
  }
  state.me = state.members.find(m => m.user_id === session.user.id) ?? null;
  renderAccount();

  if (!state.me) {
    setSignedIn(false);
    $('#login-msg').innerHTML =
      `Kontoen <b>${esc(session.user.email)}</b> er ikke tilknyttet familien endnu. ` +
      'Tilføj den i <code>02_members.sql</code> og kør filen i Supabase.';
    $('#login-form').hidden = true;
    $('#login-out').hidden = false;
    return;
  }

  setSignedIn(true);
  db.subscribe({
    onEvents: () => refreshEvents(),
    onLists: () => refreshLists(),
    onStatus: s => $('#account').classList.toggle('is-live', s === 'SUBSCRIBED'),
  });
  await Promise.all([refreshEvents(), refreshLists()]);
}

function afterLogout() {
  db.unsubscribe();
  state.session = null;
  state.me = null;
  state.events = [];
  state.lists = [];
  for (const k of ['cache:events', 'cache:lists', 'cache:members']) store.set(k, null);
  state.members = [];
  renderCalendar();
  renderLists();
  renderAccount();
  $('#login-msg').textContent = 'Log ind for at se familiens kalender og lister.';
  $('#login-form').hidden = false;
  $('#login-out').hidden = true;
  setSignedIn(false);
}

function initAuth() {
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    $('#login-error').textContent = '';
    try {
      await db.signIn(f.email.value.trim(), f.password.value);
      f.password.value = '';
    } catch (err) {
      $('#login-error').textContent =
        /invalid/i.test(err.message) ? 'Forkert e-mail eller kodeord.' : err.message;
    } finally {
      btn.disabled = false;
    }
  });

  const logout = async () => { $('#account-dialog').close(); await db.signOut(); };
  $('#login-out').addEventListener('click', logout);
  $('#account').addEventListener('click', () => {
    $('#account-who').textContent = `${state.me?.name ?? ''} · ${state.session?.user.email ?? ''}`;
    $('#account-dialog').showModal();
  });
  $('#account-dialog [data-action=cancel]').addEventListener('click', () => $('#account-dialog').close());
  $('#account-dialog [data-action=logout]').addEventListener('click', logout);

  let current = null;
  db.onAuthChange(session => {
    const id = session?.user.id ?? null;
    if (id === current) { state.session = session; return; } // blot fornyet token
    current = id;
    // uden for callback'en, så supabase-js ikke låser sig
    setTimeout(() => (session ? afterLogin(session) : afterLogout()), 0);
  });
}

// ================= Kiosk-hjælpere =================

async function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  try { await navigator.wakeLock.request('screen'); } catch { /* kræver ofte et tryk først */ }
}

function initKiosk() {
  keepAwake();
  document.addEventListener('pointerdown', keepAwake, { once: true });

  $('#fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  });
  if (!document.documentElement.requestFullscreen) $('#fullscreen').hidden = true;

  // Når skærmen/appen vækkes: hent friske data
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    keepAwake();
    loadWeather();
    refreshEvents();
    refreshLists();
  });
  window.addEventListener('online', () => { refreshEvents(); refreshLists(); });

  // Sikkerhedsnet: hent alt hvert 10. minut, hvis realtid er faldet ud
  setInterval(() => { refreshEvents(); refreshLists(); }, 10 * 60e3);
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('[sw]', err));
  }
}

// ================= Start =================

$('#location').textContent = CONFIG.location.name;
document.body.classList.add('signed-out');
startClock();
initWeather();
initCalendar();
initLists();
initAuth();
initKiosk();
registerSW();
