'use strict';
(function () {
  const KEY = 'rt.apps.v1';
  const STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected'];
  const CHECKLIST = [
    'Read the whole contract, not just the salary page',
    'Salary, bonus and any benefits confirmed in writing',
    'Start date and working pattern (hours, location, hybrid)',
    'Probation length and notice period',
    'Holiday, pension and sick pay checked',
    'Right-to-work documents and references ready',
    'Asked for a few days to decide, and any questions answered',
    'Replied in writing to accept or politely decline',
  ];

  // ---- pure helpers (tested in tests/tracker.test.js) ----
  function dueState(app, today) {
    if (!app.followUp || app.status === 'Rejected' || app.status === 'Offer') return '';
    const d = String(app.followUp).slice(0, 10);
    const t = (today || new Date().toISOString()).slice(0, 10);
    if (d < t) return 'overdue';
    if (d === t) return 'today';
    return '';
  }
  function counts(apps) {
    const c = {};
    STATUSES.forEach((s) => { c[s] = 0; });
    apps.forEach((a) => { if (c[a.status] != null) c[a.status] += 1; });
    return c;
  }
  function progress(app) {
    const done = (app.checks || []).filter(Boolean).length;
    return { done, total: CHECKLIST.length };
  }
  function makeApp(f, now) {
    const company = String(f.company || '').trim().slice(0, 120);
    const role = String(f.role || '').trim().slice(0, 160);
    if (!company || !role) return null;
    const link = /^https?:\/\//i.test(String(f.link || '').trim()) ? String(f.link).trim().slice(0, 500) : '';
    return {
      id: `${Date.parse(now || new Date().toISOString())}-${Math.random().toString(36).slice(2, 7)}`,
      company, role, link,
      status: STATUSES.includes(f.status) ? f.status : 'Saved',
      followUp: /^\d{4}-\d{2}-\d{2}$/.test(f.followUp || '') ? f.followUp : '',
      notes: String(f.notes || '').slice(0, 2000),
      checks: CHECKLIST.map(() => false),
      updated: now || new Date().toISOString(),
    };
  }
  if (typeof module !== 'undefined') { module.exports = { STATUSES, CHECKLIST, dueState, counts, progress, makeApp }; return; }

  // ---- browser UI ----
  const $ = (id) => document.getElementById(id);
  if (!$('tracker')) return;
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 300))); } catch (e) { /* full or blocked */ } };
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }
  const update = (id, fn) => { const l = load(); const a = l.find((x) => x.id === id); if (a) { fn(a); a.updated = new Date().toISOString(); store(l); } draw(); };

  function card(a) {
    const due = dueState(a);
    const head = el('div', { class: 'apphead' },
      el('div', {}, el('strong', {}, a.company), ' · ', a.role,
        a.link ? el('span', {}, ' ', el('a', { href: a.link, target: '_blank', rel: 'noopener noreferrer' }, 'job post')) : null),
      el('span', { class: 'row' },
        el('select', { 'aria-label': `Status for ${a.company}`, onchange: (e) => update(a.id, (x) => { x.status = e.target.value; }) },
          STATUSES.map((s) => el('option', { value: s, selected: s === a.status }, s))),
        el('button', { type: 'button', class: 'small danger', onclick: () => { if (confirm(`Remove ${a.company} from your tracker?`)) { store(load().filter((x) => x.id !== a.id)); draw(); } } }, 'Remove')));
    const fu = el('label', {}, 'Follow up on ',
      el('input', { type: 'date', value: a.followUp || '', onchange: (e) => update(a.id, (x) => { x.followUp = e.target.value; }) }),
      due === 'overdue' ? el('span', { class: 'due' }, ' overdue') : due === 'today' ? el('span', { class: 'due' }, ' today') : null);
    const notes = el('textarea', { rows: 2, maxlength: 2000, placeholder: 'Notes: contact name, what they said, what to ask next', onchange: (e) => update(a.id, (x) => { x.notes = e.target.value; }) });
    notes.value = a.notes || '';
    const parts = [head, fu, notes];
    if (a.status === 'Offer') {
      const p = progress(a);
      parts.push(el('div', { class: 'offerbox' },
        el('strong', {}, `Offer checklist (${p.done} of ${p.total})`),
        el('ul', {}, CHECKLIST.map((t, i) => el('li', {}, el('label', {},
          el('input', { type: 'checkbox', checked: !!(a.checks || [])[i], onchange: (e) => update(a.id, (x) => { x.checks = x.checks || CHECKLIST.map(() => false); x.checks[i] = e.target.checked; }) }), ' ', t))))));
    }
    return el('div', { class: `appcard s-${a.status.toLowerCase()}` }, parts);
  }

  function draw() {
    const apps = load();
    const c = counts(apps);
    $('trkSummary').textContent = apps.length ? STATUSES.map((s) => `${s} ${c[s]}`).join(' · ') : 'No applications yet.';
    const out = $('trkList');
    out.replaceChildren();
    STATUSES.forEach((s) => {
      const group = apps.filter((a) => a.status === s).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
      if (!group.length) return;
      out.append(el('h3', {}, `${s} (${group.length})`), ...group.map(card));
    });
  }

  $('trkAdd').addEventListener('click', () => {
    const app = makeApp({ company: $('trkCompany').value, role: $('trkRole').value, link: $('trkLink').value, status: $('trkStatus').value, followUp: $('trkFollow').value });
    const st = $('trkStatusMsg');
    if (!app) { st.textContent = 'Add a company and a role.'; st.className = 'status error'; return; }
    store([app, ...load()]);
    ['trkCompany', 'trkRole', 'trkLink', 'trkFollow'].forEach((i) => { $(i).value = ''; });
    st.textContent = ''; st.className = 'status';
    draw();
  });
  $('trkFromStep1').addEventListener('click', () => { const c = $('company'); if (c && c.value.trim()) $('trkCompany').value = c.value.trim(); });
  draw();
})();
