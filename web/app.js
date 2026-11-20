'use strict';
(function () {
  const API = (window.API_BASE || '').replace(/\/$/, '');
  const $ = (id) => document.getElementById(id);
  const PROFILE_KEY = 'rt.profile.v1';
  const SAVED_KEY = 'rt.saved.v1';

  const EMPTY = () => ({
    basics: { name: '', title: '', phone: '', email: '', linkedin: '', github: '', location: '', extra: '' },
    summary: '', skills: [], experience: [], projects: [], certifications: [], education: [], competitions: [], activities: [],
  });

  const SAMPLE = () => ({
    basics: { name: 'Jane Example', title: 'Data Analyst', phone: '+44 7000 000000', email: 'jane.example@example.com', linkedin: 'janeexample', github: 'janeexample', location: 'Bristol, UK', extra: '' },
    summary: 'Data analyst with a Master\'s degree in Data Science and hands-on experience in Python, SQL and dashboarding.',
    skills: [{ label: 'Programming Languages', items: 'Python, SQL, R' }, { label: 'Tools & Technologies', items: 'Tableau, Excel, Power BI, scikit-learn' }],
    experience: [{ role: 'Data Analyst Intern', company: 'Northwind Analytics', location: 'Remote', dates: 'Jun 2025 -- Sep 2025', type: 'Internship', bullets: ['Built a **Tableau** dashboard that three teams used every week.', 'Cleaned 50,000+ customer records with Python and SQL.', 'Wrote SQL queries to support A/B test analysis.'] }],
    projects: [{ name: 'Customer Churn Predictor', tech: 'Python, scikit-learn, Flask', dates: '2025', bullets: ['Built an end-to-end churn model with cross-validation.'] }],
    certifications: [{ name: 'Google Data Analytics', issuer: 'Coursera' }],
    education: [{ school: 'University of Examplehampton', degree: 'Master of Science in Data Science', location: 'Bristol, UK', dates: 'Sep 2023 --- Jan 2025', details: ['**Relevant Coursework:** Statistics, Machine Learning'] }],
    competitions: [{ name: 'University Datathon', issuer: 'University of Examplehampton' }],
    activities: [{ name: 'Chess Club Treasurer', issuer: 'University of Examplehampton' }],
  });

  // ---------- storage (browser only) ----------
  const load = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full or blocked */ } };

  // ---------- tiny DOM helpers ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return n;
  }

  // ---------- CV form (used for both the saved CV and the tailored CV) ----------
  function field(label, obj, key, opts = {}) {
    const input = opts.area
      ? el('textarea', { rows: opts.rows || 3, maxlength: opts.max || 1500 })
      : el('input', { type: 'text', maxlength: opts.max || 300, placeholder: opts.placeholder || '' });
    input.value = opts.lines ? (obj[key] || []).join('\n') : (obj[key] || '');
    input.addEventListener('input', () => {
      obj[key] = opts.lines ? input.value.split('\n').map((x) => x.trim()).filter(Boolean) : input.value;
      opts.onChange();
    });
    return el('label', {}, label, input);
  }

  function listSection(title, arr, makeEntry, renderEntry, rerender, onChange, hint) {
    const box = el('details', { class: 'group', open: arr.length > 0 || null }, el('summary', {}, `${title} (${arr.length})`));
    if (hint) box.append(el('p', { class: 'hint' }, hint));
    arr.forEach((entry, i) => {
      const e = el('div', { class: 'entry' }, renderEntry(entry), el('button', { type: 'button', class: 'small danger', onclick: () => { arr.splice(i, 1); onChange(); rerender(); } }, 'Remove'));
      box.append(e);
    });
    box.append(el('div', { class: 'row' }, el('button', { type: 'button', class: 'small ghost', onclick: () => { arr.push(makeEntry()); onChange(); rerender(true, title); } }, `Add to ${title.toLowerCase()}`)));
    return box;
  }

  function renderCvForm(container, cv, onChange) {
    const openTitles = new Set([...container.querySelectorAll('details.group[open] > summary')].map((s) => s.textContent.replace(/ \(\d+\)$/, '')));
    const rerender = (opening, title) => { if (opening) openTitles.add(title); renderCvForm(container, cv, onChange); };
    const f = (label, obj, key, o) => field(label, obj, key, { ...o, onChange });
    container.replaceChildren();

    const b = cv.basics;
    container.append(el('details', { class: 'group', open: true }, el('summary', {}, 'Heading'),
      el('div', { class: 'grid2' }, f('Full name', b, 'name'), f('Headline (e.g. Data Analyst)', b, 'title'), f('Phone', b, 'phone'), f('Email', b, 'email'),
        f('LinkedIn handle', b, 'linkedin', { placeholder: 'your-handle' }), f('GitHub handle', b, 'github', { placeholder: 'your-handle' }), f('Location', b, 'location'), f('Extra line (optional)', b, 'extra'))));

    container.append(el('details', { class: 'group', open: true }, el('summary', {}, 'Professional summary'), f('Summary', cv, 'summary', { area: true, rows: 4 })));

    const sections = [
      ['Skills', cv.skills, () => ({ label: '', items: '' }), (e) => el('div', { class: 'grid2' }, f('Label', e, 'label'), f('Items, comma separated', e, 'items')), 'e.g. "Programming Languages": Python, SQL'],
      ['Experience', cv.experience, () => ({ role: '', company: '', location: '', dates: '', type: '', bullets: [] }), (e) => el('div', {}, el('div', { class: 'grid2' }, f('Job title', e, 'role'), f('Dates', e, 'dates'), f('Company', e, 'company'), f('Location', e, 'location'), f('Type (e.g. Internship)', e, 'type')), f('Bullets (one per line)', e, 'bullets', { area: true, rows: 5, lines: true })), 'Most recent first. Wrap words in **double asterisks** to bold them.'],
      ['Projects', cv.projects, () => ({ name: '', tech: '', dates: '', bullets: [] }), (e) => el('div', {}, el('div', { class: 'grid2' }, f('Project name', e, 'name'), f('Dates', e, 'dates'), f('Tech used', e, 'tech')), f('Bullets (one per line)', e, 'bullets', { area: true, rows: 4, lines: true }))],
      ['Courses and Certifications', cv.certifications, () => ({ name: '', issuer: '' }), (e) => el('div', { class: 'grid2' }, f('Name', e, 'name'), f('Provider', e, 'issuer'))],
      ['Education', cv.education, () => ({ school: '', degree: '', location: '', dates: '', details: [] }), (e) => el('div', {}, el('div', { class: 'grid2' }, f('School', e, 'school'), f('Dates', e, 'dates'), f('Degree', e, 'degree'), f('Location', e, 'location')), f('Details (one per line)', e, 'details', { area: true, rows: 3, lines: true }))],
      ['Competitions and Hackathons', cv.competitions, () => ({ name: '', issuer: '' }), (e) => el('div', { class: 'grid2' }, f('Name', e, 'name'), f('Organiser', e, 'issuer'))],
      ['Activities', cv.activities, () => ({ name: '', issuer: '' }), (e) => el('div', { class: 'grid2' }, f('Name', e, 'name'), f('Organisation', e, 'issuer'))],
    ];
    for (const [title, arr, make, render, hint] of sections) {
      const box = listSection(title, arr, make, render, rerender, onChange, hint);
      if (openTitles.has(title)) box.open = true;
      container.append(box);
    }
  }

  // ---------- state ----------
  let profile = Object.assign(EMPTY(), load(PROFILE_KEY, {}));
  let tailored = null;      // the CV currently being previewed
  let previewUrl = null;
  let lastCompany = '';

  const profileForm = $('profileForm');
  const tailoredForm = $('tailoredForm');
  const status = (msg, isError) => { const s = $('status'); s.textContent = msg || ''; s.className = `status${isError ? ' error' : ''}`; };

  function drawProfile() { renderCvForm(profileForm, profile, () => save(PROFILE_KEY, profile)); }
  drawProfile();

  $('loadSample').addEventListener('click', () => { profile = SAMPLE(); save(PROFILE_KEY, profile); drawProfile(); });
  $('clearProfile').addEventListener('click', () => { if (confirm('Clear your saved CV from this browser?')) { profile = EMPTY(); save(PROFILE_KEY, profile); drawProfile(); } });

  // ---------- API ----------
  async function api(path, body) {
    let res;
    try { res = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); } catch (e) { throw new Error('Cannot reach the server. Check your connection and try again.'); }
    if (!res.ok) {
      let msg = 'Something went wrong. Please try again.';
      try { msg = (await res.json()).error || msg; } catch (e) { /* keep default */ }
      throw new Error(msg);
    }
    return res;
  }

  async function renderPreview() {
    const res = await api('/api/render', { cv: tailored, company: lastCompany });
    const blob = await res.blob();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(blob);
    $('pdfFrame').src = previewUrl;
    $('openPdf').href = previewUrl;
    return { blob, pages: res.headers.get('X-Pages'), name: (/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || 'CV.pdf' };
  }

  function drawReport(report, pages, removed) {
    const box = $('report');
    box.replaceChildren(
      el('p', { class: 'score' }, el('strong', {}, `Job match: ${report.score}%`), ` · ${pages} page${pages === 1 ? '' : 's'}${removed ? ` · ${removed} less relevant lines left out` : ''}`),
      el('div', { class: 'report', 'aria-label': 'Keywords in your CV' }, report.matched.slice(0, 18).map((k) => el('span', { class: 'chip ok' }, k))),
    );
    if (report.missing.length) {
      box.append(el('p', { class: 'hint' }, 'The job mentions these, but your CV does not. Add them only if they are true:'),
        el('div', { class: 'report' }, report.missing.map((k) => el('span', { class: 'chip miss' }, k))));
    }
  }

  // ---------- tailor ----------
  $('tailorBtn').addEventListener('click', async () => {
    const company = $('company').value.trim();
    const job = $('job').value.trim();
    if (!company) return status('Please enter the company name.', true);
    if (job.length < 40) return status('Please paste the job description.', true);
    if (!profile.basics.name.trim()) return status('Please fill in your CV first (at least your name).', true);
    const btn = $('tailorBtn');
    btn.disabled = true; status('Tailoring your CV and building the PDF. This takes a few seconds…');
    try {
      const res = await (await api('/api/tailor', { cv: profile, job, company, maxPages: Number($('maxPages').value) })).json();
      tailored = res.cv; lastCompany = company;
      drawReport(res.report, res.pages, res.removed);
      renderCvForm(tailoredForm, tailored, () => {});
      $('result').hidden = false; $('editor').hidden = true; $('decision').hidden = false;
      status('Building the preview…');
      await renderPreview();
      status('');
      $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) { status(e.message, true); } finally { btn.disabled = false; }
  });

  $('editBtn').addEventListener('click', () => { $('editor').hidden = false; $('decision').hidden = true; $('editor').scrollIntoView({ behavior: 'smooth' }); });

  $('updateBtn').addEventListener('click', async () => {
    try { status('Updating the preview…'); const r = await renderPreview(); status(`Preview updated (${r.pages} page${r.pages === '1' ? '' : 's'}).`); } catch (e) { status(e.message, true); }
  });

  async function download() {
    try {
      status('Preparing your download…');
      const r = await renderPreview();
      const a = el('a', { href: previewUrl, download: r.name });
      document.body.append(a); a.click(); a.remove();
      saveCv(r.name);
      status(`Downloaded ${r.name}`);
    } catch (e) { status(e.message, true); }
  }
  $('fineBtn').addEventListener('click', download);
  $('downloadBtn').addEventListener('click', download);

  // ---------- My CVs ----------
  function saveCv(fileName) {
    const list = load(SAVED_KEY, []).filter((x) => x.fileName !== fileName);
    list.unshift({ fileName, company: lastCompany, savedAt: new Date().toISOString(), cv: tailored });
    save(SAVED_KEY, list.slice(0, 50));
    drawSaved();
  }

  function drawSaved() {
    const list = load(SAVED_KEY, []);
    const ul = $('savedList');
    ul.replaceChildren();
    if (!list.length) { ul.append(el('li', {}, el('span', { class: 'hint' }, 'Nothing saved yet.'))); return; }
    list.forEach((item) => {
      ul.append(el('li', {},
        el('span', {}, el('strong', {}, item.fileName), ' ', el('span', { class: 'hint' }, new Date(item.savedAt).toLocaleDateString())),
        el('span', { class: 'row' },
          el('button', { type: 'button', class: 'small ghost', onclick: async () => {
            try {
              const res = await api('/api/render', { cv: item.cv, company: item.company });
              const url = URL.createObjectURL(await res.blob());
              const a = el('a', { href: url, download: item.fileName }); document.body.append(a); a.click(); a.remove();
              setTimeout(() => URL.revokeObjectURL(url), 5000);
            } catch (e) { status(e.message, true); }
          } }, 'Download again'),
          el('button', { type: 'button', class: 'small danger', onclick: () => { save(SAVED_KEY, load(SAVED_KEY, []).filter((x) => x.fileName !== item.fileName)); drawSaved(); } }, 'Delete'))));
    });
  }
  drawSaved();
})();
