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
  let { data, error } = await sb.from('members').select('user_id,name,color,is_shared,sort,role').order('sort');
  if (error && /role/.test(error.message)) {   // før 04_point_og_info.sql er kørt
    ({ data, error } = await sb.from('members').select('user_id,name,color,is_shared,sort').order('sort'));
  }
  if (error) throw error;
  return data.map(m => ({ ...m, role: m.role ?? (m.is_shared ? 'shared' : 'child') }));
}

// ---------- Kalender ----------

const EVENT_COLS = 'id,title,starts_at,ends_at,all_day,person_id,is_private,note,created_by';
let hasPersonIds = true;   // falsk indtil 03_personer.sql er kørt

export async function loadEvents(from, to) {
  const q = cols => sb.from('events').select(cols)
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at');
  let { data, error } = await q(hasPersonIds ? EVENT_COLS + ',person_ids' : EVENT_COLS);
  if (error && /person_ids/.test(error.message)) {
    hasPersonIds = false;
    ({ data, error } = await q(EVENT_COLS));
  }
  if (error) throw error;
  return data;
}

export async function saveEvent(ev) {
  const row = {
    title: ev.title,
    starts_at: ev.starts_at,
    ends_at: ev.ends_at,
    all_day: ev.all_day,
    ...(hasPersonIds ? { person_ids: ev.person_ids ?? [] } : {}),
    person_id: ev.person_ids?.[0] ?? null,   // bagudkompatibel
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

// ---------- Pokaler: opgaver, point og bonusser ----------

/** Returnerer null, hvis tabellerne ikke findes endnu (04_point_og_info.sql ikke kørt) */
export async function loadPointsData() {
  const [c, p, r] = await Promise.all([
    sb.from('chores').select('id,title,points,icon,sort').order('sort').order('title'),
    sb.from('points').select('id,child_id,amount,reason,chore_id,created_by,created_at').order('created_at', { ascending: false }).limit(2000),
    sb.from('rewards').select('id,child_id,title,cost,redeemed_at,created_at').order('cost'),
  ]);
  const err = c.error || p.error || r.error;
  if (err) {
    if (/does not exist|schema cache|Could not find/i.test(err.message)) return null;
    throw err;
  }
  return { chores: c.data, points: p.data, rewards: r.data };
}

export async function givePoints(childId, amount, reason, choreId = null) {
  const { error } = await sb.from('points').insert({ child_id: childId, amount, reason, chore_id: choreId });
  if (error) throw error;
}

export async function deletePoints(id) {
  const { error } = await sb.from('points').delete().eq('id', id);
  if (error) throw error;
}

export async function resetPoints(childId) {
  const { error } = await sb.from('points').delete().eq('child_id', childId);
  if (error) throw error;
}

export async function saveChore(ch) {
  const row = { title: ch.title, points: ch.points, icon: ch.icon || '⭐', sort: ch.sort ?? 99 };
  const { error } = ch.id ? await sb.from('chores').update(row).eq('id', ch.id) : await sb.from('chores').insert(row);
  if (error) throw error;
}

export async function deleteChore(id) {
  const { error } = await sb.from('chores').delete().eq('id', id);
  if (error) throw error;
}

export async function saveReward(rw) {
  const row = { child_id: rw.child_id, title: rw.title, cost: rw.cost };
  const { error } = rw.id ? await sb.from('rewards').update(row).eq('id', rw.id) : await sb.from('rewards').insert(row);
  if (error) throw error;
}

export async function deleteReward(id) {
  const { error } = await sb.from('rewards').delete().eq('id', id);
  if (error) throw error;
}

/** Indløs: træk pointene fra og markér bonussen som indløst */
export async function redeemReward(rw) {
  const { error: e1 } = await sb.from('points').insert({ child_id: rw.child_id, amount: -rw.cost, reason: `Bonus indløst: ${rw.title}` });
  if (e1) throw e1;
  const { error: e2 } = await sb.from('rewards').update({ redeemed_at: new Date().toISOString() }).eq('id', rw.id);
  if (e2) throw e2;
}

// ---------- Info ----------

export async function loadInfos() {
  const { data, error } = await sb.from('infos')
    .select('id,title,icon,category,body,url,username,secret,phone,audience,sort,updated_at')
    .order('category').order('sort').order('title');
  if (error) {
    if (/does not exist|schema cache|Could not find/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

export async function saveInfo(inf) {
  const row = {
    title: inf.title, icon: inf.icon || 'ℹ️', category: inf.category || 'Andet',
    body: inf.body || null, url: inf.url || null, username: inf.username || null,
    secret: inf.secret || null, phone: inf.phone || null, audience: inf.audience || 'alle',
  };
  const { error } = inf.id ? await sb.from('infos').update(row).eq('id', inf.id) : await sb.from('infos').insert(row);
  if (error) throw error;
}

export async function deleteInfo(id) {
  const { error } = await sb.from('infos').delete().eq('id', id);
  if (error) throw error;
}

// ---------- Realtid ----------

let channel = null;

/** Kalder onEvents/onLists når noget ændres — også fra andre enheder. */
export function subscribe({ onEvents, onLists, onPoints, onInfos, onStatus }) {
  unsubscribe();
  channel = sb.channel('familie')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => onEvents())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => onLists())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items' }, () => onLists())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'points' }, () => onPoints?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards' }, () => onPoints?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chores' }, () => onPoints?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'infos' }, () => onInfos?.())
    .subscribe(status => onStatus?.(status));
}

export function unsubscribe() {
  if (channel) sb.removeChannel(channel);
  channel = null;
}
