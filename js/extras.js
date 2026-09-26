// Pokaler (point-konkurrence) og Info-kort.
// Bruges fra app.js via initExtras(ctx).

let C; // kontekst fra app.js: { state, db, $, esc, toast, fail, member, personColor, fmt, timeHM, renderLists }

// ================= Hjælpere =================

const isParent = () => C?.state.me?.role === 'parent';
const kids = () => (C?.state.members ?? []).filter(m => m.role === 'child');
const pd = () => C?.state.pointsData;

function balance(childId) {
  return (pd()?.points ?? []).filter(p => p.child_id === childId).reduce((s, p) => s + p.amount, 0);
}
function earned(childId) {
  return (pd()?.points ?? []).filter(p => p.child_id === childId && p.amount > 0).reduce((s, p) => s + p.amount, 0);
}
function openRewards(childId) {
  return (pd()?.rewards ?? []).filter(r => r.child_id === childId && !r.redeemed_at).sort((a, b) => a.cost - b.cost);
}
function leaderId() {
  const ks = kids();
  if (ks.length < 2) return null;
  const sorted = ks.map(k => [k.user_id, balance(k.user_id)]).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 && sorted[0][1] > sorted[1][1] ? sorted[0][0] : null;
}

function trophySvg(color, crown = false) {
  return `<svg class="cup" viewBox="0 0 64 64" aria-hidden="true">
    ${crown ? '<path class="crown" d="M20 9l5 5 7-8 7 8 5-5-2 10H22z"/>' : ''}
    <path class="cup-body" style="--cup:${color}" d="M18 16h28v10c0 9-6 16-14 16s-14-7-14-16z"/>
    <path class="cup-handle" style="--cup:${color}" d="M18 19h-5a1 1 0 0 0-1 1c0 6 3 10 8 11M46 19h5a1 1 0 0 1 1 1c0 6-3 10-8 11"/>
    <rect class="cup-stem" style="--cup:${color}" x="29" y="41" width="6" height="8" rx="1"/>
    <rect class="cup-base" style="--cup:${color}" x="21" y="49" width="22" height="6" rx="2"/>
    <path class="cup-shine" d="M24 20v6c0 4 2 8 5 10"/>
  </svg>`;
}

function progressHTML(childId) {
  const bal = balance(childId);
  const next = openRewards(childId);
  const ready = next.filter(r => bal >= r.cost);
  if (ready.length) {
    return `<div class="bar ready"><i style="width:100%"></i></div>
      <div class="bar-label ready">🎉 Bonus klar: <b>${C.esc(ready[0].title)}</b></div>`;
  }
  if (!next.length) return `<div class="bar"><i style="width:0"></i></div><div class="bar-label">Ingen bonus sat endnu</div>`;
  const r = next[0];
  const pct = Math.max(0, Math.min(100, (bal / r.cost) * 100));
  return `<div class="bar"><i style="width:${pct}%"></i></div>
    <div class="bar-label">${Math.max(0, bal)} / ${r.cost} → ${C.esc(r.title)}</div>`;
}

// ================= Pokal-kort (i liste-rækken) =================

export function trophyCardHTML() {
  if (!pd() || !kids().length) return '';
  const lead = leaderId();
  return `
    <section class="list glass trophy-card" id="trophy-card" tabindex="0" aria-label="Pokaler">
      <header class="list-head">
        <h2><span aria-hidden="true">🏆</span> Pokaler</h2>
        ${isParent() ? '<button type="button" class="btn-text trophy-give" data-points-tab="give">+ Point</button>' : ''}
      </header>
      <div class="trophies">
        ${kids().map(k => `
          <div class="trophy${k.user_id === lead ? ' is-leader' : ''}" style="--kid:${k.color}">
            ${trophySvg(k.color, k.user_id === lead)}
            <div class="trophy-name">${C.esc(k.name)}</div>
            <div class="trophy-points">${balance(k.user_id)}<small> point</small></div>
            ${progressHTML(k.user_id)}
          </div>`).join('')}
      </div>
    </section>`;
}

export function hasTrophyCard() {
  return !!pd() && kids().length > 0;
}

// ================= Point-dialog =================

let tab = 'score';
let giveTo = null;

function renderPointsDialog() {
  const dlg = C.$('#points-dialog');
  if (!dlg.open) return;
  const parent = isParent();
  if (!parent && tab !== 'score') tab = 'score';
  if (!giveTo || !kids().some(k => k.user_id === giveTo)) giveTo = kids()[0]?.user_id ?? null;

  const tabs = parent ? `
    <div class="seg tabs" role="tablist">
      <button type="button" data-tab="score" class="${tab === 'score' ? 'on' : ''}">Stilling</button>
      <button type="button" data-tab="give" class="${tab === 'give' ? 'on' : ''}">Giv point</button>
      <button type="button" data-tab="setup" class="${tab === 'setup' ? 'on' : ''}">Opsætning</button>
    </div>` : '';

  let body = '';
  if (!pd()) {
    body = `<p class="hint">Pokaler er ikke slået til endnu. Kør <code>supabase/04_point_og_info.sql</code> i Supabase.</p>`;
  } else if (!kids().length) {
    body = `<p class="hint">Der er ingen børn i familien endnu. Sæt <code>role = 'child'</code> på børnene i tabellen members.</p>`;
  } else if (tab === 'score') {
    body = scoreHTML(parent);
  } else if (tab === 'give') {
    body = giveHTML();
  } else {
    body = setupHTML();
  }

  C.$('#points-body').innerHTML = tabs + body;
}

function scoreHTML(parent) {
  const lead = leaderId();
  const history = (pd().points ?? []).slice(0, 25);
  return `
    <div class="trophies big">
      ${kids().map(k => {
        const rs = openRewards(k.user_id);
        const bal = balance(k.user_id);
        return `
        <div class="trophy${k.user_id === lead ? ' is-leader' : ''}" style="--kid:${k.color}">
          ${trophySvg(k.color, k.user_id === lead)}
          <div class="trophy-name">${C.esc(k.name)}</div>
          <div class="trophy-points">${bal}<small> point</small></div>
          <div class="trophy-earned">${earned(k.user_id)} optjent i alt</div>
          ${progressHTML(k.user_id)}
          ${rs.length ? `<ul class="reward-list">${rs.map(r => `
            <li class="${bal >= r.cost ? 'ready' : ''}">
              <span>🎁 ${C.esc(r.title)}</span><b>${r.cost}</b>
              ${parent && bal >= r.cost ? `<button type="button" class="btn-primary btn-sm" data-redeem="${r.id}">Indløs</button>` : ''}
            </li>`).join('')}</ul>` : ''}
        </div>`;
      }).join('')}
    </div>
    <h3 class="sub">Seneste</h3>
    <ul class="history">
      ${history.length ? history.map(p => {
        const k = C.member(p.child_id);
        return `<li>
          <span class="dot" style="--dot:${k?.color ?? 'var(--muted)'}"></span>
          <span class="h-who">${C.esc(k?.name ?? '?')}</span>
          <span class="h-reason">${C.esc(p.reason)}</span>
          <span class="h-when">${C.fmt(new Date(p.created_at), { day: 'numeric', month: 'short' })}</span>
          <b class="h-amt ${p.amount < 0 ? 'neg' : ''}">${p.amount > 0 ? '+' : ''}${p.amount}</b>
          ${parent ? `<button type="button" class="item-del" data-del-points="${p.id}" aria-label="Fortryd">×</button>` : ''}
        </li>`;
      }).join('') : '<li class="empty">Ingen point endnu – kom i gang! 💪</li>'}
    </ul>`;
}

function giveHTML() {
  return `
    <h3 class="sub">Hvem?</h3>
    <div class="chips">
      ${kids().map(k => `
        <label class="chip" style="--chip:${k.color}">
          <input type="radio" name="give-to" value="${k.user_id}" ${k.user_id === giveTo ? 'checked' : ''}>
          <span>${C.esc(k.name)} · ${balance(k.user_id)}</span>
        </label>`).join('')}
    </div>
    <h3 class="sub">For hvad? <small>Tryk for at give point med det samme</small></h3>
    <div class="chore-grid">
      ${(pd().chores ?? []).map(ch => `
        <button type="button" class="chore" data-chore="${ch.id}">
          <span class="chore-icon">${C.esc(ch.icon)}</span>
          <span class="chore-title">${C.esc(ch.title)}</span>
          <b>+${ch.points}</b>
        </button>`).join('') || '<p class="hint">Ingen opgaver endnu – opret dem under Opsætning.</p>'}
    </div>
    <h3 class="sub">Andet</h3>
    <form class="inline-form" id="custom-points" autocomplete="off">
      <input name="amount" type="number" inputmode="numeric" placeholder="Point" required min="-10000" max="10000" step="1">
      <input name="reason" placeholder="Hvorfor? (fx 'Hjalp naboen')" required maxlength="120">
      <button type="submit" class="btn-primary">Giv</button>
    </form>
    <p class="hint">Brug minus (fx −10) for at trække point fra.</p>
    <p class="give-status" id="give-status" role="status"></p>`;
}

function setupHTML() {
  const chores = pd().chores ?? [];
  const rewards = (pd().rewards ?? []).filter(r => !r.redeemed_at);
  return `
    <h3 class="sub">Bonusser <small>Når et barn har nok point, kan bonussen indløses</small></h3>
    <ul class="setup-list">
      ${rewards.map(r => {
        const k = C.member(r.child_id);
        return `<li><span class="dot" style="--dot:${k?.color ?? 'var(--muted)'}"></span>
          <span class="grow">🎁 ${C.esc(r.title)} <small>${C.esc(k?.name ?? '')}</small></span>
          <b>${r.cost}</b>
          <button type="button" class="item-del" data-del-reward="${r.id}" aria-label="Slet">×</button></li>`;
      }).join('') || '<li class="empty">Ingen bonusser endnu</li>'}
    </ul>
    <form class="inline-form" id="reward-form" autocomplete="off">
      <select name="child">
        <option value="all">Alle børn</option>
        ${kids().map(k => `<option value="${k.user_id}">${C.esc(k.name)}</option>`).join('')}
      </select>
      <input name="title" placeholder="Bonus (fx Biograftur)" required maxlength="80">
      <input name="cost" type="number" inputmode="numeric" placeholder="Point" required min="1" max="100000" value="200">
      <button type="submit" class="btn-primary">Tilføj</button>
    </form>

    <h3 class="sub">Opgaver</h3>
    <ul class="setup-list">
      ${chores.map(ch => `<li>
        <span class="grow">${C.esc(ch.icon)} ${C.esc(ch.title)}</span>
        <b>+${ch.points}</b>
        <button type="button" class="item-del" data-del-chore="${ch.id}" aria-label="Slet">×</button></li>`).join('') || '<li class="empty">Ingen opgaver</li>'}
    </ul>
    <form class="inline-form" id="chore-form" autocomplete="off">
      <input name="icon" placeholder="🧹" maxlength="8" class="w-icon">
      <input name="title" placeholder="Opgave (fx Vaske bil)" required maxlength="60">
      <input name="points" type="number" inputmode="numeric" placeholder="Point" required min="1" max="1000" value="10">
      <button type="submit" class="btn-primary">Tilføj</button>
    </form>`;
}

export function openPoints(startTab = 'score') {
  tab = isParent() ? startTab : 'score';
  C.$('#points-dialog').showModal();
  renderPointsDialog();
}

async function afterChange(msg) {
  await refreshPoints();
  if (msg) {
    const st = C.$('#give-status');
    if (st) st.textContent = msg; else C.toast(msg, 'ok');
  }
}

function celebrateIfReached(childId, before) {
  const after = balance(childId);
  const hit = openRewards(childId).find(r => before < r.cost && after >= r.cost);
  if (hit) {
    const k = C.member(childId);
    const st = C.$('#give-status');
    const msg = `🎉 ${k?.name ?? ''} har nået bonussen “${hit.title}”!`;
    if (st) st.textContent = msg; else C.toast(msg, 'ok');
    confetti();
  }
}

function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ffd479', '#8fd0ff', '#f472b6', '#6ee7a6', '#fb923c', '#a78bfa'];
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = colors[i % colors.length];
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(s);
  }
  (C.$('#points-dialog').open ? C.$('#points-dialog') : document.body).appendChild(box);
  setTimeout(() => box.remove(), 3500);
}

function initPointsDialog() {
  const dlg = C.$('#points-dialog');
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  C.$('#points-close').addEventListener('click', () => dlg.close());

  C.$('#points-body').addEventListener('change', e => {
    if (e.target.name === 'give-to') giveTo = e.target.value;
  });

  C.$('#points-body').addEventListener('click', async e => {
    const t = e.target.closest('[data-tab]');
    if (t) { tab = t.dataset.tab; renderPointsDialog(); return; }

    const ch = e.target.closest('[data-chore]');
    if (ch && giveTo) {
      const chore = pd().chores.find(c => c.id === ch.dataset.chore);
      const before = balance(giveTo);
      ch.disabled = true;
      try {
        await C.db.givePoints(giveTo, chore.points, chore.title, chore.id);
        await afterChange(`✓ +${chore.points} til ${C.member(giveTo)?.name}: ${chore.title}`);
        celebrateIfReached(giveTo, before);
      } catch (err) { C.fail(err, 'Kunne ikke give point'); }
      return;
    }

    const rd = e.target.closest('[data-redeem]');
    if (rd) {
      const rw = pd().rewards.find(r => r.id === rd.dataset.redeem);
      rd.disabled = true;
      try {
        await C.db.redeemReward(rw);
        confetti();
        await afterChange(`🎁 ${C.member(rw.child_id)?.name} har indløst “${rw.title}”`);
      } catch (err) { C.fail(err, 'Kunne ikke indløse'); }
      return;
    }

    const dp = e.target.closest('[data-del-points]');
    if (dp) { try { await C.db.deletePoints(dp.dataset.delPoints); await afterChange(); } catch (err) { C.fail(err, 'Kunne ikke fortryde'); } return; }
    const dr = e.target.closest('[data-del-reward]');
    if (dr) { try { await C.db.deleteReward(dr.dataset.delReward); await afterChange(); } catch (err) { C.fail(err, 'Kunne ikke slette'); } return; }
    const dc = e.target.closest('[data-del-chore]');
    if (dc) { try { await C.db.deleteChore(dc.dataset.delChore); await afterChange(); } catch (err) { C.fail(err, 'Kunne ikke slette'); } }
  });

  C.$('#points-body').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    try {
      if (f.id === 'custom-points' && giveTo) {
        const amount = parseInt(f.amount.value, 10);
        if (!amount) return;
        const before = balance(giveTo);
        await C.db.givePoints(giveTo, amount, f.reason.value.trim());
        await afterChange(`✓ ${amount > 0 ? '+' : ''}${amount} til ${C.member(giveTo)?.name}`);
        celebrateIfReached(giveTo, before);
      } else if (f.id === 'reward-form') {
        const targets = f.child.value === 'all' ? kids().map(k => k.user_id) : [f.child.value];
        for (const child_id of targets) {
          await C.db.saveReward({ child_id, title: f.title.value.trim(), cost: parseInt(f.cost.value, 10) });
        }
        await afterChange();
      } else if (f.id === 'chore-form') {
        await C.db.saveChore({ title: f.title.value.trim(), points: parseInt(f.points.value, 10), icon: f.icon.value.trim() || '⭐', sort: (pd().chores?.length ?? 0) + 1 });
        await afterChange();
      }
    } catch (err) { C.fail(err, 'Kunne ikke gemme'); }
  });
}

export async function refreshPoints() {
  if (!C.state.me) return;
  try {
    C.state.pointsData = await C.db.loadPointsData();
  } catch (err) {
    C.fail(err, 'Pokaler');
  }
  C.renderLists();
  renderPointsDialog();
}

// ================= Info =================

let infoQuery = '';

function infoMatches(i, q) {
  if (!q) return true;
  return [i.title, i.category, i.body, i.username, i.phone, i.url].some(v => v && v.toLowerCase().includes(q));
}

function renderInfoDialog() {
  const dlg = C.$('#info-dialog');
  if (!dlg.open) return;
  C.$('#info-new').hidden = !isParent();
  const list = C.state.infos;
  const el = C.$('#info-list');
  if (list === null) {
    el.innerHTML = `<p class="hint">Info er ikke slået til endnu. Kør <code>supabase/04_point_og_info.sql</code> i Supabase.</p>`;
    return;
  }
  const q = infoQuery.trim().toLowerCase();
  const items = (list ?? []).filter(i => infoMatches(i, q));
  if (!items.length) {
    el.innerHTML = `<p class="empty">${q ? 'Intet fundet.' : (isParent() ? 'Ingen info endnu – tryk “+ Ny info”.' : 'Ingen info endnu.')}</p>`;
    return;
  }
  const groups = new Map();
  for (const i of items) {
    if (!groups.has(i.category)) groups.set(i.category, []);
    groups.get(i.category).push(i);
  }
  el.innerHTML = [...groups].map(([cat, arr]) => `
    <h3 class="sub">${C.esc(cat)}</h3>
    <div class="info-grid">
      ${arr.map(i => `
        <article class="info-card${i.audience === 'forældre' ? ' parents' : ''}" data-info="${i.id}">
          <header>
            <span class="info-icon">${C.esc(i.icon)}</span>
            <h4>${C.esc(i.title)}</h4>
            ${i.audience === 'forældre' ? '<span class="badge">Kun forældre</span>' : ''}
            ${isParent() ? `<button type="button" class="list-menu" data-edit-info="${i.id}" aria-label="Ret">✎</button>` : ''}
          </header>
          ${i.phone ? field('Telefon', `<a href="tel:${C.esc(i.phone.replace(/\s/g, ''))}">${C.esc(i.phone)}</a>`, i.phone) : ''}
          ${i.url ? field('Link', `<a href="${C.esc(safeUrl(i.url))}" target="_blank" rel="noopener">${C.esc(i.url.replace(/^https?:\/\//, ''))}</a>`, i.url) : ''}
          ${i.username ? field('Brugernavn', C.esc(i.username), i.username) : ''}
          ${i.secret ? `<div class="field"><span class="f-label">Kode</span>
            <span class="f-val secret" data-secret="${i.id}">••••••••</span>
            <button type="button" class="f-btn" data-reveal="${i.id}" aria-label="Vis kode">👁</button>
            <button type="button" class="f-btn" data-copy-secret="${i.id}" aria-label="Kopiér kode">⧉</button></div>` : ''}
          ${i.body ? `<p class="info-body">${C.esc(i.body)}</p>` : ''}
        </article>`).join('')}
    </div>`).join('');
}

function safeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function field(label, html, copyValue) {
  return `<div class="field"><span class="f-label">${label}</span><span class="f-val">${html}</span>
    <button type="button" class="f-btn" data-copy="${C.esc(copyValue)}" aria-label="Kopiér">⧉</button></div>`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    C.toast('Kopieret ✓', 'ok');
  } catch {
    C.toast('Kunne ikke kopiere');
  }
}

export function openInfo() {
  infoQuery = '';
  C.$('#info-search').value = '';
  C.$('#info-dialog').showModal();
  renderInfoDialog();
  refreshInfos();
}

function openInfoEdit(info = null) {
  const dlg = C.$('#info-edit-dialog');
  const f = dlg.querySelector('form');
  f.reset();
  f.dataset.id = info?.id ?? '';
  dlg.querySelector('h2').textContent = info ? 'Ret info' : 'Ny info';
  for (const k of ['icon', 'title', 'category', 'phone', 'url', 'username', 'secret', 'body']) f[k].value = info?.[k] ?? '';
  if (!info) { f.icon.value = 'ℹ️'; f.category.value = ''; }
  f.audience.value = info?.audience ?? 'alle';
  C.$('#info-categories').innerHTML = [...new Set((C.state.infos ?? []).map(i => i.category))]
    .map(c => `<option value="${C.esc(c)}">`).join('');
  const del = dlg.querySelector('[data-action=delete]');
  del.hidden = !info;
  del.textContent = 'Slet';
  del.classList.remove('confirm');
  dlg.showModal();
  f.title.focus();
}

function initInfo() {
  const dlg = C.$('#info-dialog');
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  C.$('#info-close').addEventListener('click', () => dlg.close());
  C.$('#info-new').addEventListener('click', () => openInfoEdit());
  C.$('#info-search').addEventListener('input', e => { infoQuery = e.target.value; renderInfoDialog(); });

  C.$('#info-list').addEventListener('click', e => {
    const c = e.target.closest('[data-copy]');
    if (c) { copy(c.dataset.copy); return; }
    const cs = e.target.closest('[data-copy-secret]');
    if (cs) { const i = C.state.infos.find(x => x.id === cs.dataset.copySecret); if (i) copy(i.secret); return; }
    const rv = e.target.closest('[data-reveal]');
    if (rv) {
      const i = C.state.infos.find(x => x.id === rv.dataset.reveal);
      const span = C.$(`[data-secret="${rv.dataset.reveal}"]`);
      const shown = span.dataset.shown === '1';
      span.textContent = shown ? '••••••••' : i.secret;
      span.dataset.shown = shown ? '0' : '1';
      return;
    }
    const ed = e.target.closest('[data-edit-info]');
    if (ed) openInfoEdit(C.state.infos.find(x => x.id === ed.dataset.editInfo));
  });

  const edlg = C.$('#info-edit-dialog');
  const f = edlg.querySelector('form');
  edlg.querySelector('[data-action=cancel]').addEventListener('click', () => edlg.close());
  edlg.querySelector('[data-action=delete]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    if (!btn.classList.contains('confirm')) { btn.classList.add('confirm'); btn.textContent = 'Tryk igen for at slette'; return; }
    try { await C.db.deleteInfo(f.dataset.id); edlg.close(); await refreshInfos(); }
    catch (err) { C.fail(err, 'Kunne ikke slette'); }
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const data = { id: f.dataset.id || null, audience: f.audience.value };
    for (const k of ['icon', 'title', 'category', 'phone', 'url', 'username', 'secret', 'body']) data[k] = f[k].value.trim();
    try { await C.db.saveInfo(data); edlg.close(); await refreshInfos(); }
    catch (err) { C.fail(err, 'Kunne ikke gemme'); }
  });
}

export async function refreshInfos() {
  if (!C.state.me) return;
  try {
    C.state.infos = await C.db.loadInfos();
  } catch (err) {
    C.fail(err, 'Info');
  }
  renderInfoDialog();
}

// ================= Init =================

export function initExtras(ctx) {
  C = ctx;
  initPointsDialog();
  initInfo();
  // Klik på pokal-kortet åbner dialogen
  C.$('#lists').addEventListener('click', e => {
    const give = e.target.closest('.trophy-give');
    if (give) { openPoints('give'); return; }
    if (e.target.closest('#trophy-card')) openPoints('score');
  });
}

export const extrasAvailable = () => ({ points: !!pd(), info: C.state.infos !== null && C.state.infos !== undefined, parent: isParent() });
