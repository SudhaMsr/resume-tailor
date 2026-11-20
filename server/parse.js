'use strict';
// Rule-based CV text -> structured CV. It only moves text the student already wrote into
// the right boxes. It never adds or rewrites anything, and the student reviews the result.

const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const POINT = `(?:${MON}\\.?,?\\s+\\d{4}|\\d{1,2}[/.]\\d{4}|\\d{4})`;
const NOW = '(?:present|current|now|ongoing|today)';
const DATE_RANGE = new RegExp(`\\(?\\b(${POINT})\\s*(?:-{1,3}|\\u2013|\\u2014|to)\\s*(${POINT}|${NOW})\\b\\)?`, 'i');
const SINGLE_DATE = new RegExp(`\\b(${MON}\\.?\\s+\\d{4})\\b`, 'i');

const HEADINGS = [
  ['summary', /^(professional\s+)?(summary|profile|about(\s+me)?|objective|career\s+objective|personal\s+statement)$/],
  ['experience', /^((professional|work|relevant|employment|internship)\s+)?(experience|history)(\s+history)?$|^employment$|^work$|^internships?$/],
  ['education', /^education(\s+(and|&)\s+(training|qualifications))?$|^academic\s+(background|qualifications)$|^qualifications$/],
  ['skills', /^((technical|key|core|top|relevant|it)\s+)?skills(\s+(and|&)\s+(tools|technologies|interests))?$|^technologies$|^tools(\s+(and|&)\s+technologies)?$|^core\s+competencies$/],
  ['projects', /^((academic|personal|selected|key|technical)\s+)?projects?$/],
  ['certifications', /^((courses?|licenses?|licences?)\s+(and|&)\s+)?(certifications?|certificates?|courses?)(\s+(and|&)\s+(certifications?|licenses?|licences?|courses?))?$|^licen[sc]es(\s+(and|&)\s+certifications)?$|^training$/],
  ['competitions', /^(competitions?|hackathons?|awards?|honou?rs?|achievements?|honou?rs?\s+(and|&)\s+awards?|awards?\s+(and|&)\s+(honou?rs?|achievements?)|competitions?\s+(and|&)\s+hackathons?)$/],
  ['activities', /^(activities|extracurricular(\s+activities)?|volunteer(ing)?(\s+experience)?|leadership(\s+(and|&)\s+activities)?|positions?\s+of\s+responsibility|societies|interests)$/],
  ['languages', /^languages?$/],
  ['ignore', /^(references?|contact|personal\s+details|publications?|declaration)$/],
];

const BULLET = /^\s*[•●▪◦▫‣⁃∙·■□❖➢→*+\-–—]\s+/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){2,4}\d{2,4}/;
const ROLE_WORDS = /\b(engineer|developer|analyst|intern(ship)?|assistant|manager|associate|scientist|consultant|officer|coordinator|executive|designer|researcher|technician|administrator|specialist|lead|director|trainee|ambassador|tutor|advisor|adviser|representative|programmer|architect|apprentice|volunteer|member|president|treasurer|secretary|fellow|clerk)\b/i;
const SCHOOL_WORDS = /\b(university|college|school|institute|academy|universit[eéà]|polytechnic)\b/i;
const DEGREE_WORDS = /\b(bachelor|master|b\.?sc|m\.?sc|b\.?a\b|m\.?a\b|b\.?eng|m\.?eng|b\.?tech|m\.?tech|ph\.?d|doctorate|mba|diploma|degree|a[- ]levels?|gcse|btec|certificate in|foundation)\b/i;

const clean = (s) => s.replace(/[ \t]+/g, ' ').trim();
const isBullet = (l) => BULLET.test(l);
const unbullet = (l) => l.replace(BULLET, '').trim();

function headingKey(line) {
  const t = clean(line).replace(/[:–—-]+$/, '').trim().toLowerCase();
  if (!t || t.length > 45 || /[.!?]$/.test(t)) return null;
  for (const [key, re] of HEADINGS) if (re.test(t)) return key;
  return null;
}

function normRange(m, dash) {
  const fix = (x) => x.replace(/^\(|\)$/g, '').replace(/\s+/g, ' ').replace(/^(\w)(\w*)/, (a, b, c) => b.toUpperCase() + c.toLowerCase());
  return `${fix(m[1])} ${dash} ${fix(m[2])}`;
}

// split "A | B", "A, B", "A at B" ... into parts
const parts = (s) => s.split(/\s+[|•·]\s+|\s+[–—-]\s+|\s+at\s+|\s*\|\s*/i).map(clean).filter(Boolean);

function joinBullets(lines) {
  const out = [];
  for (const raw of lines) {
    const l = clean(raw);
    if (!l) continue;
    if (isBullet(l)) { out.push(unbullet(l)); continue; }
    const prev = out[out.length - 1];
    if (prev !== undefined && !/[.;!?:]$/.test(prev) && /^[a-z0-9(]/.test(l)) out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out.filter(Boolean);
}

// ---------- sections ----------
function splitSections(lines) {
  const head = []; const secs = []; let cur = null;
  for (const line of lines) {
    const k = headingKey(line);
    if (k) { cur = { key: k, lines: [] }; secs.push(cur); } else if (cur) cur.lines.push(line); else head.push(line);
  }
  return { head, secs };
}

function parseHeader(head, fullText) {
  const b = { name: '', title: '', phone: '', email: '', linkedin: '', github: '', location: '', extra: '' };
  const em = fullText.match(EMAIL); if (em) b.email = em[0];
  const li = fullText.match(/linkedin\.com\/(?:in\/)?([A-Za-z0-9\-_%]+)/i); if (li) b.linkedin = li[1];
  const gh = fullText.match(/github\.com\/([A-Za-z0-9\-_]+)/i); if (gh) b.github = gh[1];
  const lines = head.flatMap((l) => l.split(/\s{3,}/)).map(clean).filter(Boolean);
  const ph = lines.join('\n').match(PHONE);
  if (ph && ph[0].replace(/\D/g, '').length >= 9 && ph[0].replace(/\D/g, '').length <= 15) b.phone = clean(ph[0]);
  const plain = lines.filter((l) => !EMAIL.test(l) && !/https?:|www\.|linkedin|github/i.test(l) && !(b.phone && l.includes(b.phone)) && l.length <= 70);
  const nameLine = plain.find((l) => /^[\p{L}][\p{L}'.\- ]{2,45}$/u.test(l) && l.split(' ').length <= 5 && !/\d/.test(l) && !ROLE_WORDS.test(l));
  if (nameLine) b.name = nameLine;
  const rest = plain.filter((l) => l !== nameLine);
  const loc = rest.find((l) => /^[\p{L}.' -]+,\s*[\p{L}.' -]+(,\s*[\p{L}.' -]+)?$/u.test(l) && l.length <= 45);
  if (loc) b.location = loc;
  const title = rest.find((l) => l !== loc && !/\d/.test(l) && l.length <= 60);
  if (title && ROLE_WORDS.test(title)) b.title = title;
  return b;
}

function parseSummary(lines) { return lines.map(clean).filter(Boolean).join(' ').slice(0, 1500); }

function parseSkills(lines) {
  const rows = []; const loose = [];
  for (const raw of lines) {
    const l = unbullet(clean(raw)); if (!l) continue;
    const m = l.match(/^([^:]{2,40}):\s*(.+)$/);
    if (m) rows.push({ label: clean(m[1]), items: m[2].split(/\s*[,;|•·]\s*/).map(clean).filter(Boolean).join(', ') });
    else loose.push(...l.split(/\s*[,;|•·]\s*/).map(clean).filter(Boolean));
  }
  if (loose.length) rows.push({ label: 'Skills', items: loose.join(', ') });
  return rows.filter((r) => r.items);
}

function pairs(lines) {
  return joinBullets(lines).map((l) => {
    const m = l.match(/^(.*?)\s+(?:[-–—|]|by|from|at)\s+(.+)$/i);
    return m ? { name: clean(m[1]), issuer: clean(m[2]) } : { name: l, issuer: '' };
  }).filter((p) => p.name);
}

// Group lines into entries; an entry's header is the lines before its first bullet/after the previous entry.
function entriesByDates(lines) {
  const L = lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
  const idx = [];
  L.forEach((l, i) => { if (!isBullet(l) && DATE_RANGE.test(l)) idx.push(i); });
  if (!idx.length) return null;
  const starts = idx.map((di) => {
    let s = di;
    while (s > 0 && !isBullet(L[s - 1]) && di - (s - 1) <= 2 && !DATE_RANGE.test(L[s - 1]) && !/[.;]$/.test(L[s - 1].trim())) s--;
    return s;
  });
  const out = [];
  starts.forEach((s, k) => {
    const e = k + 1 < starts.length ? starts[k + 1] : L.length;
    let h = idx[k] + 1;
    while (h < e && h - idx[k] <= 2 && !isBullet(L[h]) && clean(L[h]).length <= 120 && !/[.;!?]$/.test(L[h].trim())) h++;
    out.push({ header: L.slice(s, h), body: L.slice(h, e) });
  });
  return out;
}

function parseExperience(lines, warnings) {
  const ents = entriesByDates(lines);
  if (!ents) {
    if (lines.some((l) => l.trim())) warnings.push('I could not find dates in your Experience section, so I put its text in as one entry. Please split it into jobs.');
    const bullets = joinBullets(lines);
    return bullets.length ? [{ role: '', company: '', location: '', dates: '', type: '', bullets }] : [];
  }
  return ents.map(({ header, body }) => {
    let dates = '';
    const hs = header.flatMap((h) => h.split(/\s{3,}/)).map((h) => {
      const m = h.match(DATE_RANGE);
      if (m) { dates = normRange(m, '--'); h = h.replace(DATE_RANGE, ' ').replace(/[|,\u2013\u2014-]\s*$/, ''); }
      return clean(h);
    }).filter(Boolean);
    let role = ''; let company = ''; let location = ''; let type = '';
    const items = hs.flatMap(parts);
    for (const it of items) {
      if (!type && /^(internship|full[- ]time|part[- ]time|contract|freelance|volunteer|placement|temporary|apprenticeship)$/i.test(it)) { type = it; continue; }
      if (!role && ROLE_WORDS.test(it)) { role = it; continue; }
      if (!company && !/^[\p{L}.' -]+,\s*[\p{L}.' -]+$/u.test(it)) { company = it; continue; }
      if (!location && /^[\p{L}.' -]+(,\s*[\p{L}.' -]+)+$|^remote$/iu.test(it)) { location = it; continue; }
      if (!role) role = it; else if (!company) company = it;
    }
    return { role, company, location, dates, type, bullets: joinBullets(body).slice(0, 12) };
  });
}

function parseEducation(lines, warnings) {
  const ents = entriesByDates(lines);
  const build = (header, body) => {
    let dates = '';
    const hs = header.flatMap((h) => h.split(/\s{3,}/)).map((h) => { const m = h.match(DATE_RANGE); if (m) { dates = normRange(m, '---'); h = h.replace(DATE_RANGE, ' '); } return clean(h); }).filter(Boolean);
    let school = ''; let degree = ''; let location = '';
    for (const it of hs.flatMap(parts)) {
      if (!school && SCHOOL_WORDS.test(it)) school = it;
      else if (!degree && DEGREE_WORDS.test(it)) degree = it;
      else if (!location && /^[\p{L}.' -]+(,\s*[\p{L}.' -]+)+$/u.test(it)) location = it;
      else if (!school) school = it; else if (!degree) degree = it;
    }
    return { school, degree, location, dates, details: joinBullets(body).slice(0, 8) };
  };
  if (ents) return ents.map((e) => build(e.header, e.body));
  const ls = lines.map(clean).filter(Boolean);
  if (!ls.length) return [];
  warnings.push('I could not find dates in your Education section. Please check it.');
  return [build(ls.slice(0, 2), ls.slice(2))];
}

function parseProjects(lines) {
  const ents = entriesByDates(lines);
  const mk = (header, body) => {
    let dates = '';
    const cells = header.flatMap((x) => x.split(/\s{3,}/)).map(clean).filter(Boolean).filter((c) => {
      const m = c.match(DATE_RANGE);
      if (m) { dates = normRange(m, '--'); return false; }
      if (/^(?:\w+\.?\s+)?\d{4}$/.test(c)) { dates = c; return false; }
      return true;
    });
    const [name, ...tech] = cells.join(' ').split(/\s+[|\u2013\u2014]\s+|\s+-\s+|:\s+/);
    return { name: clean(name || ''), tech: clean(tech.join(', ')), dates, bullets: joinBullets(body).slice(0, 12) };
  };
  if (ents) return ents.map((e) => mk(e.header, e.body));
  // no dates: an entry starts at a non-bullet line that follows bullets (or starts the section)
  const out = []; let cur = null; let prevBullet = true;
  for (const l of lines.map((x) => x.trim()).filter(Boolean)) {
    if (!isBullet(l) && prevBullet && l.length <= 110 && !/[.;]$/.test(l)) { cur = { header: [l], body: [] }; out.push(cur); prevBullet = false; continue; }
    if (!cur) { cur = { header: [l], body: [] }; out.push(cur); continue; }
    cur.body.push(l); prevBullet = isBullet(l) || /[.;!?]$/.test(l);
  }
  return out.map((e) => mk(e.header, e.body));
}

function parseCvText(text) {
  const warnings = [];
  const lines = String(text).split('\n');
  const { head, secs } = splitSections(lines);
  const get = (k) => secs.filter((s) => s.key === k).flatMap((s) => s.lines);
  const cv = {
    basics: parseHeader(head, text.slice(0, 20000)),
    summary: parseSummary(get('summary')),
    skills: parseSkills(get('skills').concat(get('languages').length ? [`Languages: ${get('languages').map((l) => unbullet(clean(l))).filter(Boolean).join(', ')}`] : [])),
    experience: parseExperience(get('experience'), warnings),
    projects: parseProjects(get('projects')),
    certifications: pairs(get('certifications')),
    education: parseEducation(get('education'), warnings),
    competitions: pairs(get('competitions')),
    activities: pairs(get('activities')),
  };
  if (!secs.length) warnings.push('I could not find section headings (like Experience or Education), so most of your CV may be missing. Try the paste box, or fill it in by hand.');
  if (!cv.basics.name) warnings.push('I could not find your name. Please type it in.');
  if (!cv.basics.email) warnings.push('I could not find your email address.');
  if (!cv.experience.length && !cv.projects.length) warnings.push('No experience or projects found. Please check the text you gave me.');
  return { cv, warnings, noSections: !secs.length };
}

module.exports = { parseCvText, headingKey, DATE_RANGE };
