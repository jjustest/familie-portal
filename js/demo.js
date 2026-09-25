// Eksempeldata til forhåndsvisning: åbn siden med ?demo i adressen.
// Bruges kun til at se layoutet — intet gemmes.

import { addDays, dateKey, fromKey } from './util.js';

export const DEMO_MEMBERS = [
  { user_id: 'fam', name: 'Familien', color: '#6cb0ff', is_shared: true, sort: 0 },
  { user_id: 'p1', name: 'Far', color: '#2dd4bf', is_shared: false, sort: 1 },
  { user_id: 'p2', name: 'Mor', color: '#f472b6', is_shared: false, sort: 2 },
  { user_id: 'p3', name: 'Emma', color: '#fb923c', is_shared: false, sort: 3 },
  { user_id: 'p4', name: 'Oskar', color: '#a78bfa', is_shared: false, sort: 4 },
];

export function demoEvents(now = new Date()) {
  const today = fromKey(dateKey(now));
  let n = 0;
  const ev = (dayOffset, title, start, end, person_id = null, all_day = false) => {
    const d = addDays(today, dayOffset);
    const s = new Date(d), e = new Date(d);
    if (all_day) { s.setHours(0, 0, 0, 0); e.setTime(s.getTime()); e.setDate(e.getDate() + 1); }
    else {
      const [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number);
      s.setHours(sh, sm, 0, 0); e.setHours(eh, em, 0, 0);
    }
    return { id: `demo${n++}`, title, starts_at: s.toISOString(), ends_at: e.toISOString(), all_day, person_id, is_private: false, note: null };
  };
  const h = now.getHours();
  const soon = `${String(Math.min(h + 1, 22)).padStart(2, '0')}:00`;
  const soonEnd = `${String(Math.min(h + 2, 23)).padStart(2, '0')}:00`;
  return [
    ev(0, 'Morgenmad', '07:00', '07:30'),
    ev(0, 'Hent pakke', '15:30', '15:45', 'p1'),
    ev(0, 'Træning', soon, soonEnd, 'p2'),
    ev(0, 'Film-aften', '20:30', '22:30'),
    ev(1, 'Loppemarked', '10:00', '13:00'),
    ev(1, 'Aftensmad hos mormor', '17:30', '21:00'),
    ev(2, 'Fodbold', '16:30', '17:45', 'p3'),
    ev(2, 'Madpakker – husk kage', '', '', null, true),
    ev(3, 'Tandlæge', '08:15', '09:00', 'p4'),
    ev(3, 'Forældremøde', '19:00', '20:30', 'p2'),
    ev(4, 'Svømning', '17:00', '18:00', 'p4'),
    ev(5, 'Fodbold', '16:30', '17:45', 'p3'),
    ev(5, 'Fredagsbar', '15:00', '17:00', 'p1'),
    ev(6, 'Skraldespand ud', '07:00', '07:15'),
    ev(6, 'Bedsteforældre på besøg', '', '', null, true),
  ];
}

export function demoLists() {
  const t = i => new Date(Date.now() - i * 60e3).toISOString();
  return [
    { id: 'l1', name: 'Indkøb', icon: '🛒', sort: 1, owner_id: null, items: [
      { id: 'a1', text: 'Mælk', done: false, created_at: t(1) },
      { id: 'a2', text: 'Rugbrød', done: false, created_at: t(2) },
      { id: 'a3', text: 'Kaffe', done: false, created_at: t(3) },
      { id: 'a4', text: 'Opvasketabs', done: false, created_at: t(4) },
      { id: 'a5', text: 'Bananer', done: true, created_at: t(5) },
    ] },
    { id: 'l2', name: 'Huskeliste', icon: '📌', sort: 2, owner_id: null, items: [
      { id: 'b1', text: 'Betal kontingent fodbold', done: false, created_at: t(1) },
      { id: 'b2', text: 'Skift pære i entréen', done: false, created_at: t(2) },
      { id: 'b3', text: 'Aflever bibliotekbøger', done: true, created_at: t(3) },
    ] },
    { id: 'l3', name: 'Ugens aftensmad', icon: '🍽️', sort: 3, owner_id: null, items: [
      { id: 'c1', text: 'Lasagne', done: false, created_at: t(1) },
      { id: 'c2', text: 'Frikadeller', done: false, created_at: t(2) },
      { id: 'c3', text: 'Taco', done: false, created_at: t(3) },
    ] },
  ];
}

/** Samme funktioner som db.js, men i hukommelsen (til ?demo) */
export function createDemoApi() {
  let events = demoEvents();
  let lists = demoLists();
  const id = () => `d${Math.random().toString(36).slice(2, 9)}`;
  const clone = x => JSON.parse(JSON.stringify(x));
  const session = { user: { id: 'fam', email: 'demo@familie' } };
  return {
    onAuthChange: cb => setTimeout(() => cb(session), 0),
    signIn: async () => {}, signOut: async () => {},
    loadMembers: async () => clone(DEMO_MEMBERS),
    loadEvents: async (from, to) => clone(events.filter(e => new Date(e.starts_at) < to && new Date(e.ends_at) > from)),
    saveEvent: async ev => {
      if (ev.id) Object.assign(events.find(e => e.id === ev.id), ev);
      else events.push({ ...ev, id: id() });
    },
    deleteEvent: async eid => { events = events.filter(e => e.id !== eid); },
    loadLists: async () => clone(lists),
    addItem: async (listId, text) => { lists.find(l => l.id === listId).items.unshift({ id: id(), text, done: false, created_at: new Date().toISOString() }); },
    setItemDone: async (iid, done) => { for (const l of lists) { const it = l.items.find(i => i.id === iid); if (it) it.done = done; } },
    deleteItem: async iid => { for (const l of lists) l.items = l.items.filter(i => i.id !== iid); },
    clearDone: async listId => { const l = lists.find(x => x.id === listId); l.items = l.items.filter(i => !i.done); },
    saveList: async list => {
      if (list.id) Object.assign(lists.find(l => l.id === list.id), list);
      else lists.push({ ...list, id: id(), items: [] });
    },
    deleteList: async lid => { lists = lists.filter(l => l.id !== lid); },
    subscribe: ({ onStatus }) => onStatus?.('SUBSCRIBED'),
    unsubscribe: () => {},
  };
}
