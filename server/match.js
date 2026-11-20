'use strict';
// Rule-based tailoring engine. No network calls, no AI model: it extracts keywords
// from a job description, scores the student's own content against them, and
// reorders / trims. It never writes new claims, so it cannot invent anything.

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just may me might more most must my no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yours`.split(/\s+/));

// words that appear in nearly every job advert and say nothing about fit
const GENERIC = new Set(`ability able apply applicants applicant benefits candidate candidates company competitive culture degree description desired duties employer environment equal essential excellent experience experienced following full good great help including join knowledge looking opportunity opportunities passion people please position preferred required requirements responsibilities responsibility role salary skills strong successful team teams time understanding well work working years year plus within across across ensure support including based using use used new key high level day write build run present maintain automate clearly clear provide develop create make`.split(/\s+/));

// words that are very common in a field: still count, but weigh little
const SOFT = new Map([['data', 0.35], ['analyst', 0.5], ['analysis', 0.5], ['report', 0.6], ['analytics', 0.6]]);

const ALIASES = new Map([
  ['ml', 'machine learning'], ['ai', 'artificial intelligence'], ['nlp', 'natural language processing'],
  ['js', 'javascript'], ['ts', 'typescript'], ['k8s', 'kubernetes'], ['postgres', 'postgresql'],
  ['cv', 'computer vision'], ['llm', 'large language model'], ['llms', 'large language model'],
  ['gcp', 'google cloud platform'], ['aws', 'amazon web services'], ['ci/cd', 'cicd'],
]);

function stem(w) {
  if (w.length <= 3 || /[+#.]/.test(w)) return w;
  if (/ies$/.test(w)) return `${w.slice(0, -3)}y`;
  if (/ss$/.test(w)) return w;
  const m = /^(.{3,}?)(ing|ed|es|s)$/.exec(w);
  const base = m ? m[1] : w;
  return base.length > 4 ? base.replace(/e$/, '') : base;
}

function words(text) {
  const out = [];
  const re = /[a-z0-9][a-z0-9+#./]*[a-z0-9+#]|[a-z0-9]/g;
  const t = String(text || '').toLowerCase().replace(/[‘’]/g, "'");
  let m;
  while ((m = re.exec(t))) {
    let w = m[0].replace(/\.+$/, '');
    if (ALIASES.has(w)) {
      for (const part of ALIASES.get(w).split(' ')) out.push(part);
      continue;
    }
    out.push(w);
  }
  return out;
}

// stemmed content tokens (stopwords removed) — used for matching
function tokens(text) {
  return words(text).filter((w) => !STOP.has(w) && w.length > 1).map(stem);
}

// Extract weighted keywords (single terms + two-word phrases) from a job description.
function jobKeywords(jobText, limit = 45) {
  const score = new Map(); // key -> {weight, display}
  const add = (key, display, w) => {
    const cur = score.get(key) || { weight: 0, display };
    cur.weight += w;
    score.set(key, cur);
  };
  const segments = String(jobText || '').split(/[\n\r.;:!?()]+(?=\s|$)|[\n\r]+/);
  for (const seg of segments) {
    const ws = words(seg).filter((w) => w.length > 1);
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (STOP.has(w) || GENERIC.has(w) || /^\d+$/.test(w)) continue;
      add(stem(w), w, SOFT.get(w) || 1);
      const n = ws[i + 1];
      if (n && !STOP.has(n) && !GENERIC.has(n) && !/^\d+$/.test(n)) add(`${stem(w)} ${stem(n)}`, `${w} ${n}`, 1.6);
    }
  }
  // every candidate term is considered; repeated and technical terms rank first
  const pool = [...score.entries()].map(([key, v]) => [key, { ...v, weight: v.weight + (/[+#.]/.test(key) ? 1 : 0) }]);
  pool.sort((a, b) => b[1].weight - a[1].weight);
  return pool.slice(0, limit).map(([key, v]) => ({ key, display: v.display, weight: v.weight }));
}

function textScore(text, kws) {
  const toks = new Set(tokens(text));
  const seq = ` ${tokens(text).join(' ')} `;
  let s = 0;
  const hits = [];
  for (const k of kws) {
    const ok = k.key.includes(' ') ? seq.includes(` ${k.key} `) : toks.has(k.key);
    if (ok) { s += k.weight; hits.push(k.display); }
  }
  return { score: s, hits };
}

const nz = (v) => (typeof v === 'string' ? v : '');

function entryText(e, fields) { return fields.map((f) => (Array.isArray(e[f]) ? e[f].join(' ') : nz(e[f]))).join(' '); }

// Score + reorder in place on a deep copy. Returns { cv, kws }.
function rank(cv, jobText) {
  const kws = jobKeywords(jobText);
  const out = JSON.parse(JSON.stringify(cv));
  const sc = (t) => textScore(t, kws).score;

  for (const e of out.experience || []) {
    e._bulletScores = (e.bullets || []).map((b) => sc(b));
    const order = (e.bullets || []).map((b, i) => i).sort((a, b) => e._bulletScores[b] - e._bulletScores[a] || a - b);
    e.bullets = order.map((i) => e.bullets[i]);
    e._bulletScores = order.map((i) => e._bulletScores[i]);
    e._score = sc(entryText(e, ['role', 'bullets']));
  }
  for (const p of out.projects || []) {
    p._bulletScores = (p.bullets || []).map((b) => sc(b));
    const order = (p.bullets || []).map((b, i) => i).sort((a, b) => p._bulletScores[b] - p._bulletScores[a] || a - b);
    p.bullets = order.map((i) => p.bullets[i]);
    p._bulletScores = order.map((i) => p._bulletScores[i]);
    p._score = sc(entryText(p, ['name', 'tech', 'bullets']));
  }
  // projects: most relevant first (stable); experience stays in the student's own order
  out.projects = (out.projects || []).map((p, i) => ({ p, i })).sort((a, b) => b.p._score - a.p._score || a.i - b.i).map((x) => x.p);

  for (const s of out.skills || []) {
    const items = nz(s.items).split(',').map((x) => x.trim()).filter(Boolean);
    const scored = items.map((it, i) => ({ it, i, s: sc(it) }));
    scored.sort((a, b) => b.s - a.s || a.i - b.i);
    s.items = scored.map((x) => x.it).join(', ');
    s._score = scored.reduce((t, x) => t + x.s, 0);
  }
  out.skills = (out.skills || []).map((s, i) => ({ s, i })).sort((a, b) => b.s._score - a.s._score || a.i - b.i).map((x) => x.s);

  for (const key of ['certifications', 'competitions', 'activities']) {
    for (const c of out[key] || []) c._score = sc(`${nz(c.name)} ${nz(c.issuer)}`);
  }
  return { cv: out, kws };
}

// Which job keywords does this CV cover, and which does it not mention at all?
function coverage(cv, kws) {
  const text = [
    cv.summary,
    ...(cv.skills || []).map((s) => `${s.label} ${s.items}`),
    ...(cv.experience || []).map((e) => `${e.role} ${(e.bullets || []).join(' ')}`),
    ...(cv.projects || []).map((p) => `${p.name} ${p.tech} ${(p.bullets || []).join(' ')}`),
    ...(cv.certifications || []).map((c) => `${c.name} ${c.issuer}`),
    ...(cv.education || []).map((e) => `${e.degree} ${(e.details || []).join(' ')}`),
  ].join(' \n ');
  const { hits } = textScore(text, kws);
  const hitSet = new Set(hits);
  const total = kws.reduce((t, k) => t + k.weight, 0) || 1;
  const got = kws.filter((k) => hitSet.has(k.display)).reduce((t, k) => t + k.weight, 0);
  return {
    score: Math.round((got / total) * 100),
    matched: kws.filter((k) => hitSet.has(k.display)).map((k) => k.display),
    missing: (() => {
      const miss = kws.filter((k) => !hitSet.has(k.display)).map((k) => k.display);
      const phrases = miss.filter((m) => m.includes(' '));
      return miss.filter((m) => m.includes(' ') || !phrases.some((p) => p.split(' ').includes(m))).slice(0, 12);
    })(),
  };
}

function strip(cv) {
  const copy = JSON.parse(JSON.stringify(cv));
  const clean = (o) => {
    if (Array.isArray(o)) o.forEach(clean);
    else if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) { if (k.startsWith('_')) delete o[k]; else clean(o[k]); }
    }
  };
  clean(copy);
  return copy;
}

// Candidate removals, cheapest (least relevant) first. Education and the heading are never removed.
function removalOrder(cv) {
  const cands = [];
  (cv.activities || []).forEach((c, i) => cands.push({ cost: 0.2 + (c._score || 0) * 0.5, kind: 'activities', i }));
  (cv.competitions || []).forEach((c, i) => cands.push({ cost: 0.4 + (c._score || 0) * 0.5, kind: 'competitions', i }));
  (cv.certifications || []).forEach((c, i) => cands.push({ cost: 0.6 + (c._score || 0) * 0.6, kind: 'certifications', i }));
  (cv.experience || []).forEach((e, ei) => (e.bullets || []).forEach((b, bi) => {
    if (bi >= 2) cands.push({ cost: 1 + (e._bulletScores[bi] || 0) + (e._score || 0) * 0.05, kind: 'ebullet', ei, bi });
  }));
  (cv.projects || []).forEach((p, pi) => {
    (p.bullets || []).forEach((b, bi) => { if (bi >= 2) cands.push({ cost: 1 + (p._bulletScores[bi] || 0), kind: 'pbullet', pi, bi }); });
    if (pi >= 1) cands.push({ cost: 2 + (p._score || 0) * 2, kind: 'project', pi });
  });
  (cv.experience || []).forEach((e, ei) => { if (ei >= 1) cands.push({ cost: 4 + (e._score || 0) * 3, kind: 'experience', ei }); });
  (cv.experience || []).forEach((e, ei) => (e.bullets || []).forEach((b, bi) => {
    if (bi === 1) cands.push({ cost: 3 + (e._bulletScores[bi] || 0), kind: 'ebullet', ei, bi });
  }));
  (cv.projects || []).forEach((p, pi) => (p.bullets || []).forEach((b, bi) => {
    if (bi === 1) cands.push({ cost: 3 + (p._bulletScores[bi] || 0), kind: 'pbullet', pi, bi });
  }));
  return cands.sort((a, b) => a.cost - b.cost);
}

function removeOne(cv, c) {
  if (c.kind === 'activities' || c.kind === 'competitions' || c.kind === 'certifications') cv[c.kind][c.i] = null;
  else if (c.kind === 'ebullet') { const e = cv.experience[c.ei]; if (e) e.bullets[c.bi] = null; }
  else if (c.kind === 'pbullet') { const p = cv.projects[c.pi]; if (p) p.bullets[c.bi] = null; }
  else if (c.kind === 'project') cv.projects[c.pi] = null;
  else if (c.kind === 'experience') cv.experience[c.ei] = null;
}

function compact(cv) {
  for (const k of ['activities', 'competitions', 'certifications', 'projects', 'experience']) cv[k] = (cv[k] || []).filter(Boolean);
  for (const e of [...(cv.experience || []), ...(cv.projects || [])]) {
    const keep = (e.bullets || []).map((b) => b !== null);
    e.bullets = (e.bullets || []).filter((b, i) => keep[i]);
    if (e._bulletScores) e._bulletScores = e._bulletScores.filter((b, i) => keep[i]);
  }
}

// Apply the first `count` removals from `order` to a copy of the CV.
function trimWith(cv, order, count) {
  const copy = JSON.parse(JSON.stringify(cv));
  for (const c of order.slice(0, count)) removeOne(copy, c);
  compact(copy);
  return copy;
}

module.exports = { jobKeywords, textScore, rank, coverage, strip, removalOrder, trimWith, tokens, words, stem };
