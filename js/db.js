// Supabase: login, kalender, lister og realtid.
// Kræver at js/vendor/supabase.js er indlæst først (global `supabase`).

import { CONFIG } from './config.js';

export const sb = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.key, {
  auth: {
    persistSession: true,       // infoskærmen forbliver logget ind
    autoRefreshToken: true,
    storageKey: 'familie-auth',
  },
});

// ---------- Login ----------

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  sb.auth.onAuthStateChange((_event, session) => cb(session));
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await sb.auth.signOut();
}

// ---------- Familiemedlemmer ----------

export async function loadMembers() {
  const { data, error } = await sb.from('members').select('user_id,name,color,is_shared,sort').order('sort');
  if (error) throw error;
  return data;
}

// ---------- Kalender ----------

export async function loadEvents(from, to) {
  const { data, error } = await sb
    .from('events')
    .select('id,title,starts_at,ends_at,all_day,person_id,is_private,note,created_by')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at');
  if (error) throw error;
  return data;
}

export async function saveEvent(ev) {
  const row = {
    title: ev.title,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at,
    all_day: ev.all_day,
    person_id: ev.person_id || null,
    is_private: !!ev.is_private,
    note: ev.note || null,
  };
  const q = ev.id
    ? sb.from('events').update(row).eq('id', ev.id)
    : sb.from('events').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteEvent(id) {
  const { error } = await sb.from('events').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Lister ----------

export async function loadLists() {
  const { data, error } = await sb
    .from('lists')
    .select('id,name,icon,sort,owner_id,list_items(id,text,done,done_at,created_at)')
    .order('sort')
    .order('created_at');
  if (error) throw error;
  for (const l of data) {
    l.items = (l.list_items ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at));
    delete l.list_items;
  }
  return data;
}

export async function addItem(listId, text) {
  const { error } = await sb.from('list_items').insert({ list_id: listId, text });
  if (error) throw error;
}

export async function setItemDone(id, done) {
  const { error } = await sb.from('list_items')
    .update({ done, done_at: done ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteItem(id) {
  const { error } = await sb.from('list_items').delete().eq('id', id);
  if (error) throw error;
}

export async function clearDone(listId) {
  const { error } = await sb.from('list_items').delete().eq('list_id', listId).eq('done', true);
  if (error) throw error;
}

export async function saveList(list) {
  const row = { name: list.name, icon: list.icon || '📝', owner_id: list.owner_id ?? null, sort: list.sort ?? 99 };
  const q = list.id
    ? sb.from('lists').update(row).eq('id', list.id)
    : sb.from('lists').insert(row);
  const { error } = await q;
  if (error) throw error;
}

export async function deleteList(id) {
  const { error } = await sb.from('lists').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Realtid ----------

let channel = null;

/** Kalder onEvents/onLists når noget ændres — også fra andre enheder. */
export function subscribe({ onEvents, onLists, onStatus }) {
  unsubscribe();
  channel = sb.channel('familie')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => onEvents())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => onLists())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => onLists())
    .subscribe(status => onStatus?.(status));
}

export function unsubscribe() {
  if (channel) sb.removeChannel(channel);
  channel = null;
}
