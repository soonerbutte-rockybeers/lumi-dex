/* Lumi Dex — companion for Pokémon Luminescent Platinum, built for the AYN Thor bottom screen */
'use strict';

const $ = (s, r = document) => r.querySelector(s);
const h = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TOP = $('#top'), MAIN = $('#main'), NAV = $('#nav');

// ---------- persistent state ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem('lumi.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lumi.' + k, JSON.stringify(v)); } catch { } },
};
const S = {
  view: LS.get('view', 'route'),
  loc: LS.get('loc', 0), sub: 0,
  recents: LS.get('recents', []),
  caught: LS.get('caught', {}),          // "zone|id" -> true (per-route ticks)
  dexQ: '', dexType: null, dexOnly: null,
  mvQ: '', mvType: null, mvCat: null,
  mvTab: 'lv',
  teams: LS.get('teams', null),
  teamIx: LS.get('teamIx', 0),
  big: LS.get('big', false),
  showTr: LS.get('showTr', true), showIt: LS.get('showIt', true),
  beaten: LS.get('beaten', {}),   // boss index -> true
  dexCaught: LS.get('dexCaught', {}), // pokemon id -> true
  dexShow: 'all',                 // 'all' | 'caught' | 'missing'
  sugPool: LS.get('sugPool', 'now'), // 'now' | 'all'
};
if (!S.teams) S.teams = [{ name: 'Team 1', slots: [null, null, null, null, null, null] }];
document.documentElement.classList.toggle('big', S.big);

// ---------- data ----------
let D, MON, MOVE, BYNO;
const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
// attack -> defense multipliers (Gen 6+ chart), index order = TYPES
const CH = {};
(function () {
  const z = (a, b, m) => { CH[a] ??= {}; CH[a][b] = m; };
  const t = (a, se = [], nve = [], no = []) => { se.forEach(b => z(a, b, 2)); nve.forEach(b => z(a, b, .5)); no.forEach(b => z(a, b, 0)); };
  t('Normal', [], ['Rock', 'Steel'], ['Ghost']);
  t('Fighting', ['Normal', 'Rock', 'Steel', 'Ice', 'Dark'], ['Flying', 'Poison', 'Bug', 'Psychic', 'Fairy'], ['Ghost']);
  t('Flying', ['Fighting', 'Bug', 'Grass'], ['Rock', 'Steel', 'Electric']);
  t('Poison', ['Grass', 'Fairy'], ['Poison', 'Ground', 'Rock', 'Ghost'], ['Steel']);
  t('Ground', ['Poison', 'Rock', 'Steel', 'Fire', 'Electric'], ['Bug', 'Grass'], ['Flying']);
  t('Rock', ['Flying', 'Bug', 'Fire', 'Ice'], ['Fighting', 'Ground', 'Steel']);
  t('Bug', ['Grass', 'Psychic', 'Dark'], ['Fighting', 'Flying', 'Poison', 'Ghost', 'Steel', 'Fire', 'Fairy']);
  t('Ghost', ['Ghost', 'Psychic'], ['Dark'], ['Normal']);
  t('Steel', ['Rock', 'Ice', 'Fairy'], ['Steel', 'Fire', 'Water', 'Electric']);
  t('Fire', ['Bug', 'Steel', 'Grass', 'Ice'], ['Rock', 'Fire', 'Water', 'Dragon']);
  t('Water', ['Ground', 'Rock', 'Fire'], ['Water', 'Grass', 'Dragon']);
  t('Grass', ['Ground', 'Rock', 'Water'], ['Flying', 'Poison', 'Bug', 'Steel', 'Fire', 'Grass', 'Dragon']);
  t('Electric', ['Flying', 'Water'], ['Grass', 'Electric', 'Dragon'], ['Ground']);
  t('Psychic', ['Fighting', 'Poison'], ['Steel', 'Psychic'], ['Dark']);
  t('Ice', ['Flying', 'Ground', 'Grass', 'Dragon'], ['Steel', 'Fire', 'Water', 'Ice']);
  t('Dragon', ['Dragon'], ['Steel'], ['Fairy']);
  t('Dark', ['Ghost', 'Psychic'], ['Fighting', 'Dark', 'Fairy']);
  t('Fairy', ['Fighting', 'Dragon', 'Dark'], ['Poison', 'Steel', 'Fire']);
})();
const eff = (atk, def) => CH[atk]?.[def] ?? 1;
const defMult = (atk, types) => types.reduce((m, d) => m * eff(atk, d), 1);
const monTypes = (m) => m.t[0] === m.t[1] ? [TYPES[m.t[0]]] : [TYPES[m.t[0]], TYPES[m.t[1]]];

const METHOD_ORDER = ['Walking', 'Morning', 'Day', 'Night', 'Radar', 'Swarm', 'Incense', 'Honey Tree', 'Surfing', 'Surfing Incense', 'Old Rod', 'Good Rod', 'Super Rod', 'Starter', 'Gifts', 'Trade', 'Static', 'Legendaries', 'Daily Trophy Garden', 'Daily Great Marsh'];
const METHOD_LABEL = { Walking: 'Grass / walking', Radar: 'Poké Radar', Incense: 'Incense (walking)', 'Surfing Incense': 'Incense (surfing)', Legendaries: 'Legendary', Static: 'Static encounter', Gifts: 'Gift', 'Daily Trophy Garden': 'Trophy Garden (daily)', 'Daily Great Marsh': 'Great Marsh (daily)' };

async function boot() {
  const r = await fetch('data.json');
  D = await r.json();
  MON = new Map(D.mons.map(m => [m.id, m]));
  MOVE = new Map(D.moves.map(m => [m.id, m]));
  BYNO = new Map(); for (const m of D.mons) if (m.base) BYNO.set(m.no, m);
  if (S.loc >= D.groups.length) S.loc = 0;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  history.replaceState({ d: 0 }, '');
  render();
}

// ---------- navigation ----------
const stack = [];   // overlay stack: {kind, ...}
function push(o) { stack.push(o); history.pushState({ d: stack.length }, ''); render(); }
function pop() { if (stack.length) history.back(); }
window.addEventListener('popstate', (e) => { const d = e.state?.d ?? 0; while (stack.length > d) stack.pop(); render(); });
NAV.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (stack.length) { stack.length = 0; history.replaceState({ d: 0 }, ''); }
  S.view = b.dataset.v; LS.set('view', S.view); MAIN.scrollTop = 0; render();
});
let toastT; function toast(s) { const t = $('#toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1400); }

function render() {
  document.querySelectorAll('body > .sheet').forEach(x => x.remove());
  NAV.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
  const o = stack[stack.length - 1];
  if (o) {
    if (o.kind === 'mon') return renderMon(o);
    if (o.kind === 'move') return renderMove(o);
    if (o.kind === 'locpick') return renderLocPick();
    if (o.kind === 'slot') return renderSlot(o);
    if (o.kind === 'pickmon') return renderPickMon(o);
    if (o.kind === 'pickmove') return renderPickMove(o);
    if (o.kind === 'settings') return renderSettings();
    if (o.kind === 'boss') return renderBoss(o);
  }
  ({ route: renderRoute, dex: renderDex, team: renderTeam, moves: renderMoves, boss: renderBosses })[S.view]();
}
function topbar(title, { back = false, right = '', tap = false } = {}) {
  TOP.innerHTML = (back ? `<button class="ib" id="tbBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>` : '')
    + `<div class="ttl${tap ? ' tap' : ''}" id="tbTitle">${title}</div>` + right
    + `<button class="ib" id="tbSet" title="Settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg></button>`;
  $('#tbBack')?.addEventListener('click', pop);
  $('#tbSet').addEventListener('click', () => push({ kind: 'settings' }));
}
const spr = (m) => `sprites/${m.img}`;
const typeChips = (m) => monTypes(m).map(t => `<span class="tp ${t}" style="background:var(--${t})">${t}</span>`).join('');
const monRow = (m, extra = '', cls = '') => `<div class="row ${cls}" data-mon="${m.id}"><img class="sp" loading="lazy" src="${spr(m)}" alt=""><div class="nm">${h(m.name)}<span class="sub">${typeChips(m)}</span></div>${extra}</div>`;
MAIN.addEventListener('click', (e) => {
  const dt = e.target.closest('.tick[data-d]'); if (dt) { e.stopPropagation(); const id = dt.dataset.d; if (S.dexCaught[id]) delete S.dexCaught[id]; else S.dexCaught[id] = true; LS.set('dexCaught', S.dexCaught); dt.classList.toggle('on', !!S.dexCaught[id]); dt.closest('.row')?.classList.toggle('caught', !!S.dexCaught[id]); const c = $('#dexCnt'); if (c) c.textContent = dexCaughtCount(); return; }
  const tk = e.target.closest('.tick[data-k]'); if (tk) { e.stopPropagation(); const k = tk.dataset.k; if (S.caught[k]) delete S.caught[k]; else { S.caught[k] = true; const id = k.split('|')[1]; if (MON.has(+id)) { S.dexCaught[id] = true; LS.set('dexCaught', S.dexCaught); } } LS.set('caught', S.caught); tk.classList.toggle('on', !!S.caught[k]); tk.closest('.row')?.classList.toggle('caught', !!S.caught[k]); return; }
  const f = e.target.closest('.fh'); if (f) { f.parentElement.classList.toggle('open'); return; }
  const a = e.target.closest('.abil'); if (a) { a.classList.toggle('open'); return; }
  const r = e.target.closest('[data-mon]'); if (r && r.dataset.mon) { push({ kind: 'mon', id: +r.dataset.mon, tab: 'lv' }); return; }
  const mv = e.target.closest('[data-move]'); if (mv) { push({ kind: 'move', id: +mv.dataset.move }); return; }
});

// ---------- ROUTE ----------
function renderRoute() {
  const g = D.groups[S.loc]; if (S.sub >= g.subs.length) S.sub = 0;
  const z = g.subs[S.sub];
  TOP.innerHTML = `<button class="ib" id="lPrev" ${S.loc === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
    <button class="ttl tap cur" id="lPick"><b>${h(g.name)}</b><small>${S.loc + 1} of ${D.groups.length}</small></button>
    <button class="ib" id="lNext" ${S.loc === D.groups.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    <button class="ib" id="tbSet"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg></button>`;
  $('#tbSet').onclick = () => push({ kind: 'settings' });
  let html = '';
  if (g.subs.length > 1) html += `<div class="chips">${g.subs.map((s, i) => `<button class="chip${i === S.sub ? ' on' : ''}" data-sub="${i}">${h(shortSub(g.name, s.name))}</button>`).join('')}</div>`;
  const methods = Object.keys(z.enc).sort((a, b) => (METHOD_ORDER.indexOf(a) + 100) % 100 - (METHOD_ORDER.indexOf(b) + 100) % 100);
  if (!methods.length) html += `<div class="empty">No wild Pokémon here.</div>`;
  for (const m of methods) {
    html += `<div class="sec">${h(METHOD_LABEL[m] || m)}<span class="cnt">${z.enc[m].length}</span></div>`;
    for (const e of z.enc[m]) {
      const mon = MON.get(e.id); const k = `${z.z}|${e.id ?? e.n}`;
      const lv = e.lo === e.hi ? `Lv ${e.lo}` : `Lv ${e.lo}–${e.hi}`;
      const rt = `<div class="rt">${h(e.c)}<small>${lv}</small></div><button class="tick${S.caught[k] ? ' on' : ''}" data-k="${k}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`;
      html += mon ? monRow(mon, rt, S.caught[k] ? 'caught' : '') : `<div class="row"><div class="sp"></div><div class="nm">${h(e.n)}</div>${rt}</div>`;
    }
  }
  if (S.showTr && z.tr.length) {
    html += `<div class="fold"><button class="fh">Trainers<span class="cnt">${z.tr.length}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="fb">`;
    for (const t of z.tr) html += `<div class="trn"><div class="tn">${h(t.name)}<span class="sub" style="color:var(--dim);font-weight:600;font-size:.75rem;margin-left:.4rem">${h(t.type)}</span></div><div class="tt">${t.team.map(p => { const m = MON.get(p.id); return `<span class="tm" data-mon="${p.id}">${m ? `<img loading="lazy" src="${spr(m)}" alt="">` : ''}${h(m?.name || '?')} <span style="color:var(--dim)">${p.lv}</span></span>`; }).join('')}</div></div>`;
    html += `</div></div>`;
  }
  if (S.showIt && (z.fi.length || z.hi.length)) {
    html += `<div class="fold"><button class="fh">Items<span class="cnt">${z.fi.length + z.hi.length}</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="fb"><div class="items">${z.fi.map(i => `<span>${h(i)}</span>`).join('')}${z.hi.map(i => `<span class="h">${h(i)}</span>`).join('')}</div><div class="legend">Dashed = hidden item.</div></div></div>`;
  }
  MAIN.innerHTML = html;
  $('#lPrev').onclick = () => goLoc(S.loc - 1); $('#lNext').onclick = () => goLoc(S.loc + 1);
  $('#lPick').onclick = () => push({ kind: 'locpick' });
  MAIN.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { S.sub = +b.dataset.sub; render(); });
}
function shortSub(g, s) { let x = s.replace(g, '').replace(/^[\s(]+|[)\s]+$/g, ''); return x || s; }
function goLoc(i) { S.loc = Math.max(0, Math.min(D.groups.length - 1, i)); S.sub = 0; LS.set('loc', S.loc); S.recents = [S.loc, ...S.recents.filter(x => x !== S.loc)].slice(0, 5); LS.set('recents', S.recents); MAIN.scrollTop = 0; render(); }
function renderLocPick() {
  TOP.innerHTML = ''; let q = '';
  const el = document.createElement('div'); el.className = 'sheet';
  el.innerHTML = `<div class="sh"><button class="ib" id="lpBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><input class="search" id="lpQ" placeholder="Find a location" autocomplete="off"></div><div class="sb" id="lpList"></div>`;
  MAIN.innerHTML = ''; document.body.appendChild(el);
  const list = () => {
    const ql = q.trim().toLowerCase(); let html = '';
    if (!ql && S.recents.length) { html += `<div class="sec">Recent</div>` + S.recents.map(i => `<button class="li" data-i="${i}"><span class="ix">${i + 1}</span>${h(D.groups[i].name)}</button>`).join('') + `<div class="sec">Story order</div>`; }
    D.groups.forEach((g, i) => { if (ql && !g.name.toLowerCase().includes(ql) && !g.subs.some(s => s.name.toLowerCase().includes(ql))) return; html += `<button class="li${i === S.loc ? ' on' : ''}" data-i="${i}"><span class="ix">${i + 1}</span>${h(g.name)}</button>`; });
    $('#lpList').innerHTML = html || `<div class="empty">Nothing matches.</div>`;
    $('#lpList').querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; stack.pop(); history.replaceState({ d: stack.length }, ''); goLoc(i); });
  };
  $('#lpQ').oninput = (e) => { q = e.target.value; list(); }; $('#lpBack').onclick = pop; list();
  if (!ql_isTouchOnly()) $('#lpQ').focus();
}
function ql_isTouchOnly() { return matchMedia('(pointer:coarse)').matches; }

// ---------- DEX ----------
function renderDex() {
  topbar('Pokédex');
  const ql = S.dexQ.trim().toLowerCase();
  let html = `<input class="search" id="dxQ" placeholder="Search Pokémon" value="${h(S.dexQ)}" autocomplete="off">
    <div class="chips"><span class="chip" style="background:transparent;color:var(--gold);padding-left:.2rem" id="dexCnt">${dexCaughtCount()}</span>${[['all', 'All'], ['caught', 'Caught'], ['missing', 'Missing']].map(([k, l]) => `<button class="chip${S.dexShow === k ? ' on' : ''}" data-show="${k}">${l}</button>`).join('')}</div>
    <div class="chips"><button class="chip${S.dexType == null ? ' on' : ''}" data-t="">All types</button>${TYPES.map(t => `<button class="chip t${S.dexType === t ? ' on' : ''}" data-t="${t}" style="background:var(--${t})">${t}</button>`).join('')}</div>`;
  let n = 0;
  for (const m of D.mons) {
    if (!m.base && !ql) continue;
    if (ql && !m.name.toLowerCase().includes(ql) && String(m.no) !== ql) continue;
    if (S.dexType && !monTypes(m).includes(S.dexType)) continue;
    const c = !!S.dexCaught[m.id];
    if (S.dexShow === 'caught' && !c) continue; if (S.dexShow === 'missing' && c) continue;
    html += monRow(m, `<div class="rt" style="color:var(--dim);font-weight:700;font-size:.8rem">#${String(m.no).padStart(3, '0')}</div><button class="tick${c ? ' on' : ''}" data-d="${m.id}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button>`, c ? 'caught' : ''); n++;
  }
  if (!n) html += `<div class="empty">No Pokémon match.</div>`;
  MAIN.innerHTML = html;
  const inp = $('#dxQ'); inp.oninput = () => { S.dexQ = inp.value; const st = MAIN.scrollTop; render(); $('#dxQ').focus(); const v = $('#dxQ'); v.setSelectionRange(v.value.length, v.value.length); MAIN.scrollTop = st; };
  MAIN.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.dexType = b.dataset.t || null; render(); });
  MAIN.querySelectorAll('[data-show]').forEach(b => b.onclick = () => { S.dexShow = b.dataset.show; render(); });
}
function dexCaughtCount() { const tot = D.mons.filter(m => m.base).length; const got = D.mons.filter(m => m.base && S.dexCaught[m.id]).length; return `${got} / ${tot} caught`; }
function statBar(v, color) { return `<div class="bar"><i style="width:${Math.min(100, v / 1.8)}%;background:${color}"></i></div>`; }
function statColor(v) { return v >= 120 ? '#6ad36a' : v >= 90 ? '#a5d84f' : v >= 60 ? '#f2c94c' : v >= 40 ? '#f2994a' : '#e4514f'; }
function gender(sex) { if (sex === 255) return 'Genderless'; if (sex === 0) return 'Male only'; if (sex === 254) return 'Female only'; const f = Math.round(sex / 256 * 1000) / 10; return `${(100 - f).toFixed(1).replace('.0', '')}% ♂ / ${f.toFixed(1).replace('.0', '')}% ♀`; }
function renderMon(o) {
  const m = MON.get(o.id); if (!m) { stack.pop(); return render(); }
  topbar(h(m.name), { back: true });
  const ST = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
  let html = `<div class="hero"><img src="${spr(m)}" alt=""><div style="flex:1;min-width:0"><div class="no">#${String(m.no).padStart(3, '0')}</div><h2>${h(m.name)}</h2><div>${typeChips(m)}</div><div class="meta">${gender(m.sex)}<br>${m.h} m · ${m.w} kg${m.egg.length ? `<br>Egg: ${h(m.egg.join(', '))}` : ''}${m.items.length ? `<br>Holds: ${h(m.items.join(', '))}` : ''}</div></div><button class="tick${S.dexCaught[m.id] ? ' on' : ''}" data-d="${m.id}" style="width:2.6rem;height:2.6rem;align-self:flex-start"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button></div>`;
  if (m.forms.length > 1) html += `<div class="chips">${m.forms.map(f => { const fm = MON.get(f); return fm ? `<button class="chip${f === m.id ? ' on' : ''}" data-mon="${f}">${h(fm.name)}</button>` : ''; }).join('')}</div>`;
  if (m.dex) html += `<div class="desc">${h(m.dex)}</div>`;
  // stats
  html += `<div class="sec">Base stats</div><div class="stats">` + m.st.map((v, i) => `<span class="k">${ST[i]}</span><span class="v">${v}</span>${statBar(v, statColor(v))}`).join('') + `<span class="tot">Total ${m.st.reduce((a, b) => a + b, 0)}</span></div>`;
  // abilities
  html += `<div class="sec">Abilities</div>` + m.ab.map((a, i) => a && a !== 'None' ? `<div class="abil"><b>${h(a)}${i === 2 ? '<small>Hidden</small>' : ''}</b><p>${h(D.abil[a] || '')}</p></div>` : '').join('');
  // weaknesses
  const tt = monTypes(m); const wk = TYPES.map(t => [t, defMult(t, tt)]).filter(x => x[1] !== 1);
  html += `<div class="sec">Type matchups</div><div class="cov">` + wk.sort((a, b) => b[1] - a[1]).map(([t, x]) => `<div class="c" style="background:var(--${t})">${t}<b>${x === 0 ? '0' : x === .25 ? '¼' : x === .5 ? '½' : x}×</b></div>`).join('') + `</div>`;
  // evolution
  if (m.evo.edges.length) {
    html += `<div class="sec">Evolution</div>`;
    const chains = evoChains(m.evo);
    for (const c of chains) html += `<div class="evo">` + c.map((step, i) => { const em = MON.get(step.id); return (i ? `<div class="ar">${h(step.how)}</div>` : '') + `<button class="en${step.id === m.id ? ' cur' : ''}" data-mon="${step.id}"><img loading="lazy" src="${em ? spr(em) : ''}" alt="">${h(em?.name || '?')}</button>`; }).join('') + `</div>`;
  }
  // locations
  html += `<div class="sec">Where to find<span class="cnt">${m.loc.length}</span></div>`;
  if (!m.loc.length) html += `<div class="desc">Not found in the wild — evolve, breed, or trade for it.</div>`;
  else for (const l of m.loc) html += `<div class="row" style="min-height:2.6rem"><div class="nm">${h(l.r)}<span class="sub">${h(METHOD_LABEL[l.m] || l.m)}</span></div><div class="rt">${l.c != null && !isNaN(l.c) ? l.c + '%' : h(l.c ?? '')}<small>Lv ${l.lo}${l.hi !== l.lo ? '–' + l.hi : ''}</small></div></div>`;
  // moves
  const tabs = [['lv', 'Level'], ['tm', 'TM'], ['eg', 'Egg'], ['tu', 'Tutor']];
  html += `<div class="sec">Moves</div><div class="mvtab">${tabs.map(([k, l]) => `<button class="${o.tab === k ? 'on' : ''}" data-tab="${k}">${l}<span style="opacity:.6;font-weight:600"> ${m[k].length}</span></button>`).join('')}</div>`;
  const list = o.tab === 'lv' ? m.lv.map(([l, id]) => [l, id]) : m[o.tab].map(id => [null, id]);
  if (!list.length) html += `<div class="empty">None.</div>`;
  for (const [lv, id] of list) html += moveRow(MOVE.get(id), lv);
  MAIN.innerHTML = html; MAIN.scrollTop = o.scroll || 0;
  MAIN.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { o.tab = b.dataset.tab; o.scroll = MAIN.scrollTop; render(); });
}
function moveRow(mv, lv, extra = '') {
  if (!mv) return '';
  const t = TYPES[mv.t];
  return `<div class="mv" data-move="${mv.id}">${lv != null ? `<span class="lv">${lv === 0 ? 'Evo' : lv}</span>` : ''}<span class="tp ${t}" style="background:var(--${t});margin:0">${t}</span><span class="cat ${mv.cat === 1 ? 'p' : mv.cat === 2 ? 's' : ''}">${['Sta', 'Phy', 'Spe'][mv.cat]}</span><span class="mn">${h(mv.name)}</span><span class="mp">${mv.pow || '—'} / ${mv.acc && mv.acc <= 100 ? mv.acc : '—'}</span>${extra}</div>`;
}
function evoChains(evo) {
  const out = new Map(); for (const [a, b, how] of evo.edges) { out.set(a, out.get(a) || []); out.get(a).push({ id: b, how }); }
  const chains = [];
  const walk = (id, path) => { const next = out.get(id); if (!next) { chains.push(path); return; } for (const n of next) walk(n.id, [...path, n]); };
  walk(evo.root, [{ id: evo.root, how: '' }]);
  return chains;
}

// ---------- MOVES ----------
function renderMoves() {
  topbar('Moves');
  const ql = S.mvQ.trim().toLowerCase();
  let html = `<input class="search" id="mvQ" placeholder="Search moves" value="${h(S.mvQ)}" autocomplete="off">
    <div class="chips"><button class="chip${S.mvType == null ? ' on' : ''}" data-t="">All types</button>${TYPES.map(t => `<button class="chip t${S.mvType === t ? ' on' : ''}" data-t="${t}" style="background:var(--${t})">${t}</button>`).join('')}</div>
    <div class="chips">${[[null, 'Any'], [1, 'Physical'], [2, 'Special'], [0, 'Status']].map(([c, l]) => `<button class="chip${S.mvCat === c ? ' on' : ''}" data-c="${c ?? ''}">${l}</button>`).join('')}</div>`;
  let n = 0;
  for (const mv of D.moves) {
    if (ql && !mv.name.toLowerCase().includes(ql)) continue;
    if (S.mvType && TYPES[mv.t] !== S.mvType) continue;
    if (S.mvCat != null && mv.cat !== S.mvCat) continue;
    html += moveRow(mv); n++;
  }
  if (!n) html += `<div class="empty">No moves match.</div>`;
  MAIN.innerHTML = html;
  const inp = $('#mvQ'); inp.oninput = () => { S.mvQ = inp.value; render(); $('#mvQ').focus(); const v = $('#mvQ'); v.setSelectionRange(v.value.length, v.value.length); };
  MAIN.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.mvType = b.dataset.t || null; render(); });
  MAIN.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.mvCat = b.dataset.c === '' ? null : +b.dataset.c; render(); });
}
function renderMove(o) {
  const mv = MOVE.get(o.id); if (!mv) { stack.pop(); return render(); }
  topbar(h(mv.name), { back: true });
  const t = TYPES[mv.t];
  let html = `<div class="hero" style="gap:.6rem"><div><h2>${h(mv.name)}</h2><div><span class="tp ${t}" style="background:var(--${t})">${t}</span><span class="cat ${mv.cat === 1 ? 'p' : mv.cat === 2 ? 's' : ''}" style="width:auto;padding:.12rem .5rem;font-size:.72rem">${['Status', 'Physical', 'Special'][mv.cat]}</span></div>
    <div class="meta">Power ${mv.pow || '—'} · Accuracy ${mv.acc && mv.acc <= 100 ? mv.acc : '—'} · PP ${mv.pp}</div></div></div><div class="desc">${h(mv.desc)}</div>`;
  const learners = [];
  for (const m of D.mons) {
    const lv = m.lv.find(x => x[1] === mv.id);
    if (lv) learners.push([m, `Lv ${lv[0] || 'Evo'}`]); else if (m.tm.includes(mv.id)) learners.push([m, 'TM']); else if (m.eg.includes(mv.id)) learners.push([m, 'Egg']); else if (m.tu.includes(mv.id)) learners.push([m, 'Tutor']);
  }
  html += `<div class="sec">Learned by<span class="cnt">${learners.length}</span></div>` + learners.map(([m, how]) => monRow(m, `<div class="rt" style="font-size:.85rem">${how}</div>`)).join('');
  MAIN.innerHTML = html;
}

// ---------- TEAM ----------
const team = () => S.teams[S.teamIx];
function saveTeams() { LS.set('teams', S.teams); LS.set('teamIx', S.teamIx); }
function renderTeam() {
  topbar('Team builder');
  const T = team();
  let html = `<div class="tmbar"><select id="tmSel">${S.teams.map((t, i) => `<option value="${i}"${i === S.teamIx ? ' selected' : ''}>${h(t.name)}</option>`).join('')}</select><button class="ib" id="tmNew" title="New team">+</button><button class="ib" id="tmRen" title="Rename"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16z"/></svg></button><button class="ib" id="tmDel" title="Delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>`;
  { const g = gradeTeam(T);
    if (g) { const rem = g.perBoss;
      html += `<div class="grade"><div class="gs">${starStr(g.stars)}</div><div class="gt"><b>${['', 'Not recommended', 'Rough ride ahead', 'Workable', 'Strong', 'Top notch'][g.stars]} <span style="color:var(--dim);font-weight:600;font-size:.8rem">· score ${Math.round(g.raw * 100)}</span></b><small>${rem.length ? `vs the ${rem.length} fight${rem.length > 1 ? 's' : ''} left · hits ${Math.round(g.off * 100)}% super-effectively · safe switch vs ${Math.round(g.def * 100)}%` : 'nothing left to fight'}</small>${g.notes.length ? `<small style="color:var(--amber)">${h(g.notes.join(' · '))}</small>` : ''}</div></div>`;
      { const rep = memberReport(T); const weakest = rep.rows.length >= 2 ? rep.rows.reduce((a, b) => b.val < a.val ? b : a) : null;
        let swap = null;
        if (weakest && rem.length) { const clone = { name: T.name, slots: T.slots.map((x, i) => i === weakest.i ? null : x) }; const cands = suggest(clone, rem[0].b).slice(0, 5);
          for (const c of cands) { const gg = swapPreview(T, weakest.i, c.m.id); if (gg && (!swap || gg.raw > swap.raw)) swap = { m: c.m, raw: gg.raw, stars: gg.stars, get: c.get }; } }
        html += `<div class="fold why"><button class="fh">Why this grade<span class="cnt">tap to expand</span><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><div class="fb">`;
        for (const r of rep.rows.slice().sort((a, b) => b.val - a.val)) {
          const isW = weakest && r.i === weakest.i;
          html += `<div class="row" data-slot="${r.i}" style="min-height:2.8rem${isW ? ';outline:1px solid var(--red);border-radius:.7rem' : ''}"><img class="sp" loading="lazy" src="${spr(r.m)}" alt="" style="width:2.2rem;height:2.2rem"><div class="nm">${h(r.m.name)}${isW ? ' <span style="color:var(--red);font-size:.72rem">weakest link</span>' : ''}<span class="sub" style="white-space:normal">${r.uniqSE ? `only member super-effective on ${r.uniqSE}` : `super-effective on ${r.se}`} · safe switch-in for ${r.uniqSafe}${r.threat ? ` · <span style="color:var(--amber)">threatened by ${r.threat}</span>` : ''} <span style="color:var(--faint)">of ${rep.n}</span></span></div></div>`; }
        if (swap && swap.raw > g.raw + 0.02) html += `<div class="row" data-mon="${swap.m.id}" style="background:var(--s1);margin-top:.3rem"><img class="sp" loading="lazy" src="${spr(swap.m)}" alt=""><div class="nm">Swap ${h(weakest.m.name)} → ${h(swap.m.name)}<span class="sub" style="white-space:normal;color:var(--tx);font-weight:500">Score ${Math.round(g.raw * 100)} → <span style="color:var(--gold)">${Math.round(swap.raw * 100)}</span>${swap.stars !== g.stars ? ` · ${starStr(g.stars)} → ${starStr(swap.stars)}` : ''}${swap.get ? ` · ${h(swap.get)}` : ''}</span></div></div>`;
        else if (weakest) html += `<div class="legend">No catchable swap improves the grade right now — set moves or tick bosses to refresh.</div>`;
        html += `</div></div>`; }
      if (rem.length) html += `<div class="bstrip">` + rem.slice(0, 12).map(x => `<button class="bs ${x.score >= .6 ? 'ok' : x.score >= .4 ? 'mid' : 'bad'}" data-boss="${x.i}" title="${h(x.b.t)}">${h(x.b.t.replace(/^(Gym \d · |Commander |Elite Four |Galactic Boss |Champion )/, '').split(' ')[0])}<b>${Math.round(x.score * 100)}</b></button>`).join('') + `</div>`;
    } }
  html += `<div class="slots">` + T.slots.map((s, i) => {
    if (!s) return `<button class="slot e" data-slot="${i}">+ Add</button>`;
    const m = MON.get(s.id); if (!m) return `<button class="slot e" data-slot="${i}">+ Add</button>`;
    const mvs = s.moves.filter(Boolean).map(id => MOVE.get(id)?.name).filter(Boolean);
    return `<button class="slot" data-slot="${i}"><img src="${spr(m)}" alt=""><div><div class="sn">${h(m.name)}</div><div class="sm">${h(s.ability || '—')}<br>${mvs.length ? h(mvs.join(', ')) : '<i>No moves set</i>'}</div></div></button>`;
  }).join('') + `</div>`;
  if (T.slots.some(Boolean)) html += `<div style="padding:.5rem 0 0"><button class="btn full" id="fillAll">Fill recommended moves for everyone</button></div>`;
  const mons = T.slots.filter(Boolean).map(s => ({ s, m: MON.get(s.id) })).filter(x => x.m);
  if (mons.length) {
    // defensive: for each attacking type, count members weak / resistant
    html += `<div class="sec">Defense — what hits your team</div><div class="cov">` + TYPES.map(t => {
      let w = 0, r = 0; for (const { m } of mons) { const x = defMult(t, monTypes(m)); if (x > 1) w++; else if (x < 1) r++; }
      const net = w - r; const cls = w >= 3 ? ' warn' : (w === 0 && r >= 2 ? ' good' : '');
      return `<div class="c${cls}" style="background:var(--${t})">${t}<b>${w}w · ${r}r</b></div>`;
    }).join('') + `</div><div class="legend">w = members weak to it, r = members resisting it. Red outline: 3+ weak. White outline: nothing weak, 2+ resist.</div>`;
    // offensive: from actual moves; fall back to STAB types if no moves set
    const atk = new Set(); let usedMoves = false;
    for (const { s, m } of mons) { const mv = s.moves.filter(Boolean).map(id => MOVE.get(id)).filter(x => x && x.cat !== 0 && x.pow > 0); if (mv.length) { usedMoves = true; mv.forEach(x => atk.add(TYPES[x.t])); } }
    if (!usedMoves) for (const { m } of mons) monTypes(m).forEach(t => atk.add(t));
    html += `<div class="sec">Offense — ${usedMoves ? 'from your moves' : 'from types (no moves set)'}</div><div class="cov">` + TYPES.map(t => {
      let best = 0; for (const a of atk) best = Math.max(best, eff(a, t));
      const cls = best < 1 ? ' warn' : best > 1 ? ' good' : '';
      return `<div class="c${cls}" style="background:var(--${t})">${t}<b>${best === 0 ? '0' : best === .5 ? '½' : best}×</b></div>`;
    }).join('') + `</div><div class="legend">Best multiplier any of your attacking moves lands on each defending type. Red: nothing hits it neutrally.</div>`;
  } else html += `<div class="empty">Tap a slot to add a Pokémon. Coverage appears once you have one.</div>`;
  {
    const nx = nextBossIx(); const boss = nx >= 0 ? D.bosses[nx] : null;
    html += `<div class="sec">Suggestions</div><div class="chips"><button class="chip${S.sugPool === 'now' ? ' on' : ''}" data-pool="now">Catchable so far</button><button class="chip${S.sugPool === 'all' ? ' on' : ''}" data-pool="all">Anyone</button></div>`;
    html += `<div class="legend">${boss ? `Scored against your team's gaps and <b>${h(boss.t)}</b> (next unticked fight in Bosses).` : 'Scored against your team\'s gaps.'}${S.sugPool === 'now' ? ` Limited to Pokémon obtainable before that fight, evolutions included where the level allows.` : ''}</div>`;
    const sug = suggest(T, boss);
    if (!sug.length) html += `<div class="empty">Nothing to suggest — tick a boss or two, or switch to Anyone.</div>`;
    for (const x of sug) html += `<div class="row" data-mon="${x.m.id}"><img class="sp" loading="lazy" src="${spr(x.m)}" alt=""><div class="nm">${h(x.m.name)}<span class="sub">${typeChips(x.m)}</span><span class="sub" style="white-space:normal;color:var(--tx);font-weight:500">${h(x.why)}</span>${x.get ? `<span class="sub" style="color:var(--gold)">${h(x.get)}</span>` : ''}</div></div>`;
  }
  MAIN.innerHTML = html;
  MAIN.querySelectorAll('[data-pool]').forEach(b => b.onclick = () => { S.sugPool = b.dataset.pool; LS.set('sugPool', S.sugPool); const st = MAIN.scrollTop; render(); MAIN.scrollTop = st; });
  $('#tmSel').onchange = (e) => { S.teamIx = +e.target.value; saveTeams(); render(); };
  $('#tmNew').onclick = () => { S.teams.push({ name: `Team ${S.teams.length + 1}`, slots: [null, null, null, null, null, null] }); S.teamIx = S.teams.length - 1; saveTeams(); render(); };
  $('#tmRen').onclick = () => { const n = prompt('Team name', T.name); if (n && n.trim()) { T.name = n.trim(); saveTeams(); render(); } };
  $('#tmDel').onclick = () => { if (!confirm(`Delete "${T.name}"?`)) return; S.teams.splice(S.teamIx, 1); if (!S.teams.length) S.teams.push({ name: 'Team 1', slots: [null, null, null, null, null, null] }); S.teamIx = Math.max(0, S.teamIx - 1); saveTeams(); render(); };
  MAIN.querySelectorAll('[data-boss]').forEach(b => b.onclick = () => push({ kind: 'boss', i: +b.dataset.boss, v: 0 }));
  if ($('#fillAll')) $('#fillAll').onclick = () => { const L = progressLevel(); T.slots.forEach(s => { if (!s) return; const m = MON.get(s.id); if (!m) return; const r = recommendMoves(s, m, L); s.moves = [0, 1, 2, 3].map(i => r[i] ? r[i].mv.id : null); }); saveTeams(); toast('Moves set'); render(); };
  MAIN.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { const i = +b.dataset.slot; if (T.slots[i]) push({ kind: 'slot', i }); else push({ kind: 'pickmon', slot: i }); });
}
function renderSlot(o) {
  const T = team(); const s = T.slots[o.i]; if (!s) { stack.pop(); return render(); }
  const m = MON.get(s.id);
  topbar(`Slot ${o.i + 1}`, { back: true });
  const abils = m.ab.filter(a => a && a !== 'None');
  let html = `<div class="edit"><div class="hero" data-mon="${m.id}"><img src="${spr(m)}" alt=""><div><h2>${h(m.name)}</h2><div>${typeChips(m)}</div><div class="meta">Tap to open dex page</div></div></div>
    <div class="ef"><label>Pokémon</label><button class="pick" id="chMon"><img src="${spr(m)}" style="width:1.8rem;height:1.8rem" alt="">${h(m.name)}<span class="x">Change</span></button></div>
    <div class="ef"><label>Ability</label><div class="chips">${abils.map((a, i) => `<button class="chip${s.ability === a ? ' on' : ''}" data-ab="${h(a)}">${h(a)}${i === 2 ? ' (H)' : ''}</button>`).join('')}</div></div>
    <div class="ef"><label>Moves</label>${[0, 1, 2, 3].map(i => { const mv = s.moves[i] ? MOVE.get(s.moves[i]) : null; return `<button class="pick${mv ? '' : ' e'}" data-mvslot="${i}" style="margin-bottom:.35rem">${mv ? `<span class="tp ${TYPES[mv.t]}" style="background:var(--${TYPES[mv.t]});margin:0">${TYPES[mv.t]}</span>${h(mv.name)}<span class="x">${mv.pow || '—'} / ${mv.acc && mv.acc <= 100 ? mv.acc : '—'}</span>` : `Move ${i + 1}`}</button>`; }).join('')}</div>
    <div class="ef"><label>Recommended moves <span style="font-weight:600">· up to Lv ${progressLevel()}</span></label>${(() => { const r = recommendMoves(s, m, progressLevel()); if (!r.length) return '<div class="desc">No damaging moves available yet.</div>'; return r.map(x => moveRow(x.mv, null, `<span class="mp" style="color:var(--faint)">${h(x.how)}</span>`)).join('') + `<button class="btn gold full" id="useRec" style="margin-top:.4rem">Use these ${r.length}</button>`; })()}</div>
    <button class="btn red full" id="rmSlot" style="margin-top:1rem">Remove from team</button></div>`;
  MAIN.innerHTML = html;
  $('#chMon').onclick = () => push({ kind: 'pickmon', slot: o.i });
  MAIN.querySelectorAll('[data-ab]').forEach(b => b.onclick = () => { s.ability = b.dataset.ab; saveTeams(); render(); });
  MAIN.querySelectorAll('[data-mvslot]').forEach(b => b.onclick = () => push({ kind: 'pickmove', slot: o.i, mv: +b.dataset.mvslot }));
  if ($('#useRec')) $('#useRec').onclick = () => { const r = recommendMoves(s, m, progressLevel()); s.moves = [0, 1, 2, 3].map(i => r[i] ? r[i].mv.id : null); saveTeams(); toast('Moves set'); render(); };
  $('#rmSlot').onclick = () => { T.slots[o.i] = null; saveTeams(); pop(); };
}
function renderPickMon(o) {
  TOP.innerHTML = ''; let q = '';
  const el = document.createElement('div'); el.className = 'sheet';
  el.innerHTML = `<div class="sh"><button class="ib" id="pmBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><input class="search" id="pmQ" placeholder="Pick a Pokémon" autocomplete="off"></div><div class="sb" id="pmList"></div>`;
  MAIN.innerHTML = ''; document.body.appendChild(el);
  const list = () => {
    const ql = q.trim().toLowerCase(); let html = '', n = 0;
    for (const m of D.mons) { if (!m.base && !ql) continue; if (ql && !m.name.toLowerCase().includes(ql)) continue; html += `<div class="row" data-pick="${m.id}"><img class="sp" loading="lazy" src="${spr(m)}" alt=""><div class="nm">${h(m.name)}<span class="sub">${typeChips(m)}</span></div></div>`; ++n; }
    $('#pmList').innerHTML = html || `<div class="empty">Nothing matches.</div>`;
    $('#pmList').querySelectorAll('[data-pick]').forEach(r => r.onclick = () => {
      const m = MON.get(+r.dataset.pick); const T = team();
      T.slots[o.slot] = { id: m.id, ability: m.ab[0] && m.ab[0] !== 'None' ? m.ab[0] : null, moves: [null, null, null, null] }; saveTeams();
      // replace this picker with the slot editor
      stack.pop(); stack.push({ kind: 'slot', i: o.slot }); history.replaceState({ d: stack.length }, ''); render();
    });
  };
  $('#pmQ').oninput = (e) => { q = e.target.value; list(); }; $('#pmBack').onclick = pop; list();
}
function renderPickMove(o) {
  const T = team(); const s = T.slots[o.slot]; const m = MON.get(s.id);
  TOP.innerHTML = ''; let q = '', tab = 'all';
  const el = document.createElement('div'); el.className = 'sheet';
  el.innerHTML = `<div class="sh"><button class="ib" id="pvBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><input class="search" id="pvQ" placeholder="Move for ${h(m.name)}" autocomplete="off"></div><div class="sb" id="pvList"></div>`;
  MAIN.innerHTML = ''; document.body.appendChild(el);
  const pool = []; const seen = new Set();
  for (const [lv, id] of m.lv) if (!seen.has(id)) { seen.add(id); pool.push([id, `Lv ${lv || 'Evo'}`, 'lv']); }
  for (const id of m.tm) if (!seen.has(id)) { seen.add(id); pool.push([id, 'TM', 'tm']); }
  for (const id of m.eg) if (!seen.has(id)) { seen.add(id); pool.push([id, 'Egg', 'eg']); }
  for (const id of m.tu) if (!seen.has(id)) { seen.add(id); pool.push([id, 'Tutor', 'tu']); }
  const list = () => {
    const ql = q.trim().toLowerCase();
    let html = `<div class="chips">${[['all', 'All'], ['lv', 'Level'], ['tm', 'TM'], ['eg', 'Egg'], ['tu', 'Tutor']].map(([k, l]) => `<button class="chip${tab === k ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}<button class="chip" data-clear="1">Clear slot</button></div>`;
    for (const [id, how, k] of pool) { const mv = MOVE.get(id); if (!mv) continue; if (tab !== 'all' && k !== tab) continue; if (ql && !mv.name.toLowerCase().includes(ql)) continue; html += moveRow(mv, null, `<span class="mp" style="color:var(--faint)">${h(how)}</span>`).replace('data-move=', 'data-pmv='); }
    $('#pvList').innerHTML = html;
    $('#pvList').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; list(); });
    $('#pvList').querySelector('[data-clear]').onclick = () => { s.moves[o.mv] = null; saveTeams(); pop(); };
    $('#pvList').querySelectorAll('[data-pmv]').forEach(r => r.onclick = () => { s.moves[o.mv] = +r.dataset.pmv; saveTeams(); pop(); });
  };
  $('#pvQ').oninput = (e) => { q = e.target.value; list(); }; $('#pvBack').onclick = pop; list();
}


// ---------- BOSSES / PROGRESS ----------
const bossLv = (b) => Math.max(...b.teams.map(t => Math.max(...t.team.map(p => p.lv))));
function nextBossIx() { for (let i = 0; i < D.bosses.length; i++) if (!S.beaten[i]) return i; return -1; }
function progressGroup() { const i = nextBossIx(); return i < 0 ? D.groups.length - 1 : D.bosses[i].g; }
function bossTeamRows(t) {
  return t.team.map(p => { const m = MON.get(p.id); if (!m) return ''; const mvs = p.mv.map(id => MOVE.get(id)).filter(Boolean);
    return `<div class="row" data-mon="${m.id}"><img class="sp" loading="lazy" src="${spr(m)}" alt=""><div class="nm">${h(m.name)} <span style="color:var(--dim);font-weight:600">Lv ${p.lv}</span><span class="sub">${typeChips(m)}${p.ab ? ` <span style="color:var(--dim)">${h(p.ab)}</span>` : ''}</span><span class="sub">${mvs.map(mv => `<span class="tp ${TYPES[mv.t]}" style="background:var(--${TYPES[mv.t]});font-size:.62rem;padding:.05rem .35rem">${h(mv.name)}</span>`).join('')}</span></div>${p.item && p.item !== 'None' ? `<div class="rt" style="font-size:.7rem;color:var(--dim);font-weight:600">${h(p.item)}</div>` : ''}</div>`; }).join('');
}
function renderBosses() {
  topbar('Bosses');
  const nx = nextBossIx(); const done = Object.keys(S.beaten).length;
  let html = '';
  if (nx >= 0) { const b = D.bosses[nx]; html += `<div class="sec">Next up</div><button class="slot" data-boss="${nx}" style="width:100%;margin-bottom:.4rem"><div style="flex:1"><div class="sn" style="font-size:1rem">${h(b.t)}</div><div class="sm">${h(D.groups[b.g].name)} · up to Lv ${bossLv(b)}${b.teams.length > 1 ? ` · ${b.teams.length} possible teams` : ''}</div></div><span style="color:var(--gold);font-weight:800">›</span></button>`; }
  else html += `<div class="desc">Everything's beaten. Nice.</div>`;
  html += `<div class="sec">Checklist<span class="cnt">${done} / ${D.bosses.length}</span></div>`;
  let lastKind = '';
  D.bosses.forEach((b, i) => {
    if (b.k === 'post' && lastKind !== 'post' && lastKind !== 'rematch') html += `<div class="sec" style="font-size:.85rem;color:var(--dim)">Post-game</div>`;
    if (b.k === 'rematch' && lastKind !== 'rematch') html += `<div class="sec" style="font-size:.85rem;color:var(--dim)">Rematches</div>`;
    lastKind = b.k;
    html += `<div class="row${S.beaten[i] ? ' caught' : ''}${i === nx ? '' : ''}" data-boss="${i}" style="min-height:2.9rem"><div class="nm">${i === nx ? '<span style="color:var(--gold)">▶ </span>' : ''}${h(b.t)}<span class="sub">${h(D.groups[b.g].name)} · Lv ${bossLv(b)}</span></div><button class="tick${S.beaten[i] ? ' on' : ''}" data-b="${i}"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg></button></div>`;
  });
  html += `<div class="legend" style="padding-top:.8rem">Tick fights as you win them. The next unticked fight sets your progress: team suggestions only use Pokémon catchable before it.</div>`;
  MAIN.innerHTML = html;
  MAIN.querySelectorAll('[data-b]').forEach(t => t.onclick = (e) => { e.stopPropagation(); const i = +t.dataset.b; if (S.beaten[i]) delete S.beaten[i]; else S.beaten[i] = true; LS.set('beaten', S.beaten); const st = MAIN.scrollTop; render(); MAIN.scrollTop = st; });
  MAIN.querySelectorAll('[data-boss]').forEach(r => r.onclick = () => push({ kind: 'boss', i: +r.dataset.boss, v: 0 }));
}
function renderBoss(o) {
  const b = D.bosses[o.i]; if (!b) { stack.pop(); return render(); }
  topbar(h(b.t), { back: true });
  let html = `<div class="desc" style="padding-top:.5rem"><b style="color:var(--tx)">${h(D.groups[b.g].name)}</b> · strongest Pokémon Lv ${bossLv(b)}${b.teams.length > 1 ? `<br>The game picks one of ${b.teams.length} teams — prepare for all of them.` : ''}</div>`;
  if (b.teams.length > 1) html += `<div class="chips">${b.teams.map((t, i) => `<button class="chip${o.v === i ? ' on' : ''}" data-v="${i}">${h(t.n.replace(/^(Gym Leader|Elite Four|Champion|Team Galactic Boss|Commander|Pokémon Trainer)\s*/, ''))}</button>`).join('')}</div>`;
  html += bossTeamRows(b.teams[o.v] || b.teams[0]);
  html += `<div style="padding:.8rem .2rem"><button class="btn ${S.beaten[o.i] ? '' : 'gold'} full" id="bsDone">${S.beaten[o.i] ? 'Mark as not beaten' : 'Mark as beaten'}</button></div>`;
  MAIN.innerHTML = html;
  MAIN.querySelectorAll('[data-v]').forEach(c => c.onclick = () => { o.v = +c.dataset.v; render(); });
  $('#bsDone').onclick = () => { if (S.beaten[o.i]) delete S.beaten[o.i]; else S.beaten[o.i] = true; LS.set('beaten', S.beaten); render(); };
}

// ---------- SUGGESTIONS ----------
function evoLevel(text) { const m = /Level (\d+)|Lv\. (\d+)/i.exec(text || ''); return m ? +(m[1] || m[2]) : null; }
const G_ETERNA = 17, G_MOSS = 15, G_ICE = 51, G_MAGNET = 22; // story-order group indexes
function evoAllowed(how, P, L) {
  // each " / " alternative is a separate path; any one that works is enough
  return (how || '').split(' / ').some(alt => {
    const lv = evoLevel(alt); if (lv != null && lv > L) return false;
    if (/Ice Rock/i.test(alt) && P < G_ICE) return false;
    if (/Moss Rock/i.test(alt) && P < G_MOSS) return false;
    if (/Magnetic Field/i.test(alt) && P < G_MAGNET) return false;
    if (/^(Use |Hold |High Beauty)/i.test(alt) && P < G_ETERNA) return false; // stones & items: Grand Underground opens at Eterna
    return true;
  });
}
function reachableSet(P, L) {
  // start from directly catchable mons up to group P, walk evolutions whose level requirement <= L
  const R = new Map(); // id -> {via: baseId}
  const base = D.mons.filter(m => m.dav != null && m.dav <= P);
  const q = []; for (const m of base) { R.set(m.id, m.id); q.push(m.id); }
  while (q.length) { const id = q.shift(); const m = MON.get(id); if (!m) continue;
    for (const [a, b, how] of m.evo.edges) { if (a !== id || R.has(b)) continue; if (!evoAllowed(how, P, L)) continue; R.set(b, R.get(id)); q.push(b); } }
  return R;
}
function suggest(T, boss) {
  const members = T.slots.filter(Boolean).map(s => ({ s, m: MON.get(s.id) })).filter(x => x.m);
  const have = new Set(members.map(x => x.m.id));
  const teamTypes = new Set(); members.forEach(({ m }) => monTypes(m).forEach(t => teamTypes.add(t)));
  const weak = {}; TYPES.forEach(t => { weak[t] = 0; members.forEach(({ m }) => { if (defMult(t, monTypes(m)) > 1) weak[t]++; }); });
  const bestOff = {}; { const atk = new Set(); let used = false; members.forEach(({ s }) => s.moves.filter(Boolean).map(id => MOVE.get(id)).filter(x => x && x.cat !== 0 && x.pow > 0).forEach(x => { used = true; atk.add(TYPES[x.t]); })); if (!used) members.forEach(({ m }) => monTypes(m).forEach(t => atk.add(t))); TYPES.forEach(t => { let b = 0; atk.forEach(a => b = Math.max(b, eff(a, t))); bestOff[t] = atk.size ? b : 1; }); }
  const P = S.sugPool === 'all' ? D.groups.length - 1 : progressGroup();
  const L = S.sugPool === 'all' ? 100 : (boss ? bossLv(boss) + 4 : 100);
  const R = reachableSet(P, L);
  const bossMons = []; if (boss) { const seen = new Set(); boss.teams.forEach(t => t.team.forEach(p => { if (!seen.has(p.id)) { seen.add(p.id); bossMons.push(p); } })); }
  const out = [];
  for (const [id, baseId] of R) {
    const m = MON.get(id); if (!m || have.has(id)) continue;
    // prefer the highest reachable form: skip if it evolves into something reachable
    if (m.evo.edges.some(([a, b]) => a === id && R.has(b))) continue;
    const tt = monTypes(m); let sc = 0; const why = [];
    // patches shared weaknesses
    const patched = TYPES.filter(t => weak[t] >= 2 && defMult(t, tt) < 1);
    if (patched.length) { sc += patched.reduce((a, t) => a + weak[t] * 1.2, 0); why.push(`resists ${patched.slice(0, 3).join(', ')} (weak spots)`); }
    const adds = TYPES.filter(t => weak[t] >= 1 && defMult(t, tt) > 1).length; sc -= adds * 0.6;
    // new offensive coverage from STAB
    const covers = TYPES.filter(t => bestOff[t] < 1 && tt.some(a => eff(a, t) >= 2));
    const neut = TYPES.filter(t => bestOff[t] < 1 && !covers.includes(t) && tt.some(a => eff(a, t) >= 1));
    if (covers.length) { sc += covers.length * 1.5; why.push(`STAB hits ${covers.slice(0, 3).join(', ')}, which nothing on your team does`); }
    sc += neut.length * 0.5;
    // vs boss
    if (bossMons.length) {
      let se = 0, hurt = 0;
      for (const p of bossMons) { const bm = MON.get(p.id); if (!bm) continue; const bt = monTypes(bm);
        if (tt.some(a => defMult(a, bt) >= 2)) se++;
        const mvT = p.mv.map(i => MOVE.get(i)).filter(x => x && x.cat !== 0 && x.pow > 0).map(x => TYPES[x.t]);
        if ((mvT.length ? mvT : bt).some(a => defMult(a, tt) >= 2)) hurt++; }
      sc += se * 1.3 - hurt * 0.9;
      if (se >= 2) why.push(`super-effective on ${se} of ${bossMons.length} of ${boss.t.replace(/^Gym \d · /, '')}'s Pokémon`);
      if (hurt >= Math.ceil(bossMons.length / 2)) why.push(`but takes super-effective hits from ${hurt} of them`);
    }
    // stats and overlap
    const bst = m.st.reduce((a, b) => a + b, 0); sc += Math.max(-1.5, Math.min(1.5, (bst - 420) / 100));
    const ov = tt.filter(t => teamTypes.has(t)).length; sc -= ov * 1.4;
    if (ov && !why.length) why.push('shares a type with your team');
    const base = MON.get(baseId); const where = base && base.dav != null ? D.groups[base.dav].name : '';
    out.push({ m, sc, why: why.slice(0, 2).join('; ') || 'solid stats, no new holes', get: base && base.id !== m.id ? `catch ${base.name} · ${where}` : where });
  }
  out.sort((a, b) => b.sc - a.sc);
  return out.slice(0, 8);
}


// ---------- TEAM GRADE + MOVESETS ----------
function remainingBosses() { return D.bosses.map((b, i) => ({ b, i })).filter(x => !S.beaten[x.i] && x.b.k !== 'rematch'); }
function bossPool(bs) { const seen = new Set(), out = []; bs.forEach(({ b }) => b.teams.forEach(t => t.team.forEach(p => { const k = p.id + '|' + p.mv.join(','); if (!seen.has(k)) { seen.add(k); out.push(p); } }))); return out; }
function memberAttackTypes(s, m) { const mv = s.moves.filter(Boolean).map(id => MOVE.get(id)).filter(x => x && x.cat !== 0 && x.pow > 0); return mv.length ? [...new Set(mv.map(x => TYPES[x.t]))] : monTypes(m); }
function gradeTeam(T) {
  const members = T.slots.filter(Boolean).map(s => ({ s, m: MON.get(s.id) })).filter(x => x.m);
  const rem = remainingBosses();
  if (!members.length) return null;
  const perBoss = rem.map(({ b, i }) => {
    const pool = bossPool([{ b }]); let se = 0, danger = 0;
    for (const p of pool) { const bm = MON.get(p.id); if (!bm) continue; const bt = monTypes(bm);
      if (members.some(({ s, m }) => memberAttackTypes(s, m).some(a => defMult(a, bt) >= 2))) se++;
      const at = p.mv.map(id => MOVE.get(id)).filter(x => x && x.cat !== 0 && x.pow > 0).map(x => TYPES[x.t]); const atk = at.length ? at : bt;
      const safe = members.some(({ m }) => atk.every(a => defMult(a, monTypes(m)) <= 1));
      if (!safe) danger++; }
    const off = pool.length ? se / pool.length : 0, def = pool.length ? 1 - danger / pool.length : 1;
    return { i, b, off, def, score: off * 0.55 + def * 0.45 };
  });
  const off = perBoss.length ? perBoss.reduce((a, x) => a + x.off, 0) / perBoss.length : 0.7;
  const def = perBoss.length ? perBoss.reduce((a, x) => a + x.def, 0) / perBoss.length : 0.7;
  let holes = 0; TYPES.forEach(t => { let w = 0; members.forEach(({ m }) => { if (defMult(t, monTypes(m)) > 1) w++; }); if (w >= 3) holes++; });
  const atk = new Set(); members.forEach(({ s, m }) => memberAttackTypes(s, m).forEach(a => atk.add(a)));
  let uncovered = 0; TYPES.forEach(t => { let best = 0; atk.forEach(a => best = Math.max(best, eff(a, t))); if (best < 1) uncovered++; });
  const roster = members.length / 6;
  const nextLv = rem.length ? bossLv(rem[0].b) : 100;
  const avgBst = members.reduce((a, { m }) => a + m.st.reduce((x, y) => x + y, 0), 0) / members.length;
  const statFit = Math.max(0, Math.min(1, (avgBst - 300) / 220));
  let raw = off * 0.38 + def * 0.30 + roster * 0.14 + statFit * 0.10 + (1 - Math.min(1, holes / 3)) * 0.04 + (1 - Math.min(1, uncovered / 4)) * 0.04;
  const cap = members.length <= 2 ? 2 : members.length === 3 ? 3 : members.length === 4 ? 4 : 5;
  const stars = Math.max(1, Math.min(cap, Math.round(raw * 5 + 0.25)));
  const notes = [];
  if (members.length < 6) notes.push(`${6 - members.length} empty slot${members.length === 5 ? '' : 's'}`);
  if (holes) notes.push(`${holes} type${holes > 1 ? 's' : ''} hit 3+ members`);
  if (uncovered) notes.push(`${uncovered} type${uncovered > 1 ? 's' : ''} nobody hits neutrally`);
  if (!members.some(({ s }) => s.moves.some(Boolean))) notes.push('no moves set — offense judged by STAB only');
  return { stars, raw, off, def, perBoss, notes, nextLv };
}

function memberReport(T) {
  const members = T.slots.map((s, i) => s ? { s, m: MON.get(s.id), i } : null).filter(x => x && x.m);
  const rem = remainingBosses(); const pool = bossPool(rem.length ? rem : []);
  const rows = members.map(x => ({ ...x, uniqSE: 0, uniqSafe: 0, threat: 0, se: 0 }));
  for (const p of pool) { const bm = MON.get(p.id); if (!bm) continue; const bt = monTypes(bm);
    const at = p.mv.map(id => MOVE.get(id)).filter(x => x && x.cat !== 0 && x.pow > 0).map(x => TYPES[x.t]); const atk = at.length ? at : bt;
    const seBy = rows.filter(r => memberAttackTypes(r.s, r.m).some(a => defMult(a, bt) >= 2));
    const safeBy = rows.filter(r => atk.every(a => defMult(a, monTypes(r.m)) <= 1));
    seBy.forEach(r => r.se++); if (seBy.length === 1) seBy[0].uniqSE++; if (safeBy.length === 1) safeBy[0].uniqSafe++;
    rows.forEach(r => { if (atk.some(a => defMult(a, monTypes(r.m)) >= 2)) r.threat++; }); }
  rows.forEach(r => { r.val = r.uniqSE * 1.0 + r.uniqSafe * 0.8 + r.se * 0.15 - r.threat * 0.35 + (r.m.st.reduce((a, b) => a + b, 0) - 420) / 150; });
  return { rows, n: pool.length };
}
function swapPreview(T, slotIx, candId) {
  const clone = { name: T.name, slots: T.slots.map(s => s ? { id: s.id, ability: s.ability, moves: s.moves.slice() } : null) };
  clone.slots[slotIx] = { id: candId, ability: null, moves: [null, null, null, null] };
  return gradeTeam(clone);
}
function starStr(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function recommendMoves(s, m, L) {
  const rem = remainingBosses(); const pool = bossPool(rem.length ? rem : D.bosses.map(b => ({ b })));
  const phys = m.st[1], spec = m.st[3]; const tt = monTypes(m);
  const cands = new Map();
  for (const [lv, id] of m.lv) if (lv <= L && !cands.has(id)) cands.set(id, `Lv ${lv || 'Evo'}`);
  for (const id of m.tm) if (!cands.has(id)) cands.set(id, 'TM');
  for (const id of m.eg) if (!cands.has(id)) cands.set(id, 'Egg');
  for (const id of m.tu) if (!cands.has(id)) cands.set(id, 'Tutor');
  const scored = [];
  for (const [id, how] of cands) { const mv = MOVE.get(id); if (!mv || mv.cat === 0 || !mv.pow) continue;
    const t = TYPES[mv.t]; const stat = mv.cat === 1 ? phys : spec, other = mv.cat === 1 ? spec : phys;
    let v = (mv.pow <= 1 ? 50 : mv.pow) * (mv.acc && mv.acc <= 100 ? mv.acc / 100 : 1) * (stat / Math.max(stat, other)) * (tt.includes(t) ? 1.5 : 1);
    let hits = 0; for (const p of pool) { const bm = MON.get(p.id); if (bm) hits += eff(t, monTypes(bm)[0]) * (monTypes(bm)[1] ? eff(t, monTypes(bm)[1]) : 1); }
    v *= 0.6 + 0.4 * (pool.length ? hits / pool.length : 1);
    if (/recharge|must rest|charges up|focuses its mind|fails if the user|lowers the user|harshly lowers|user[’']s .*stat|user takes|can[’']t move|next turn|user faints|sleeps? for/i.test(mv.desc)) v *= 0.55;
    if (how === 'TM') v *= 0.6; if (how === 'Egg') v *= 0.5; if (how === 'Tutor') v *= 0.5;
    scored.push({ mv, how, v, t }); }
  scored.sort((a, b) => b.v - a.v);
  const picks = [], usedT = new Set();
  for (const x of scored) { if (picks.length >= 4) break; if (usedT.has(x.t)) continue; picks.push(x); usedT.add(x.t); }
  for (const x of scored) { if (picks.length >= 4) break; if (!picks.includes(x)) picks.push(x); }
  return picks;
}
function progressLevel() { const i = nextBossIx(); return i < 0 ? 100 : bossLv(D.bosses[i]) + 2; }

// ---------- SETTINGS ----------
function renderSettings() {
  topbar('Settings', { back: true });
  const caught = Object.keys(S.caught).length;
  MAIN.innerHTML = `<div class="set">
    <div class="r"><div><b>Larger text</b><small>Bumps everything up a size</small></div><button class="btn${S.big ? ' gold' : ''}" id="stBig">${S.big ? 'On' : 'Off'}</button></div>
    <div class="r"><div><b>Trainers on route pages</b><small>Every trainer and their team</small></div><button class="btn${S.showTr ? ' gold' : ''}" id="stTr">${S.showTr ? 'On' : 'Off'}</button></div>
    <div class="r"><div><b>Items on route pages</b><small>Ground and hidden items</small></div><button class="btn${S.showIt ? ' gold' : ''}" id="stIt">${S.showIt ? 'On' : 'Off'}</button></div>
    <div class="r"><div><b>Cache all sprites</b><small>~11 MB so every picture works offline</small></div><button class="btn" id="stCache">Download</button></div>
    <div class="r"><div><b>Clear boss checklist</b><small>${Object.keys(S.beaten).length} beaten right now</small></div><button class="btn red" id="stClrB">Clear</button></div>
    <div class="r"><div><b>Clear Pokédex caught marks</b><small>${Object.keys(S.dexCaught).length} marked</small></div><button class="btn red" id="stClrD">Clear</button></div>
    <div class="r"><div><b>Clear route ticks</b><small>${caught} ticked right now</small></div><button class="btn red" id="stClr">Clear</button></div>
    <div class="legend" style="padding-top:1rem">Data: ${h(D.version)}, from luminescent.team. Sprites © Nintendo / Game Freak.</div></div>`;
  $('#stBig').onclick = () => { S.big = !S.big; LS.set('big', S.big); document.documentElement.classList.toggle('big', S.big); render(); };
  $('#stTr').onclick = () => { S.showTr = !S.showTr; LS.set('showTr', S.showTr); render(); };
  $('#stIt').onclick = () => { S.showIt = !S.showIt; LS.set('showIt', S.showIt); render(); };
  $('#stClrB').onclick = () => { if (confirm('Clear the boss checklist?')) { S.beaten = {}; LS.set('beaten', S.beaten); render(); } };
  $('#stClrD').onclick = () => { if (confirm('Clear all Pokédex caught marks?')) { S.dexCaught = {}; LS.set('dexCaught', S.dexCaught); render(); } };
  $('#stClr').onclick = () => { if (confirm(`Clear all ${caught} caught ticks?`)) { S.caught = {}; LS.set('caught', S.caught); render(); } };
  $('#stCache').onclick = async (e) => {
    e.target.textContent = '0%'; const urls = D.mons.map(m => spr(m)); let done = 0;
    try { const c = await caches.open('lumi-sprites'); for (let i = 0; i < urls.length; i += 12) { await Promise.all(urls.slice(i, i + 12).map(u => c.add(u).catch(() => { }))); done = Math.min(urls.length, i + 12); e.target.textContent = Math.round(done / urls.length * 100) + '%'; } e.target.textContent = 'Done'; toast('Sprites cached'); }
    catch { e.target.textContent = 'Failed'; }
  };
}

boot().catch(err => { MAIN.innerHTML = `<div class="empty">Couldn't load data.json.<br>${h(err.message)}</div>`; });
