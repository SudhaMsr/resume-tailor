'use strict';
// Interview prep from a job description and the student's CV. Rule-based, no external service.
// Questions are our own wording. Evidence lines are copied word for word from the CV, never invented.
const { jobKeywords, coverage, textScore } = require('./match');

const THEMES = [
  { id: 'teamwork', words: ['team', 'collaborat', 'cross-functional', 'partner'], ev: ['collaborat', 'coordinat', 'together', 'colleague', 'supervisor', 'group', 'cross-functional', 'trained', 'guided'], q: 'Tell me about a time you worked in a team to get something done. What was your role?' },
  { id: 'communication', words: ['communicat', 'present', 'stakeholder', 'written', 'verbal', 'explain'], ev: ['present', 'explain', 'communicat', 'stakeholder', 'blog', 'answered', 'report'], q: 'Tell me about a time you had to explain something complicated to someone who was not an expert.' },
  { id: 'leadership', words: ['lead', 'mentor', 'ownership', 'initiative', 'proactive', 'independent'], ev: ['led', 'lead', 'mentor', 'trained', 'organis', 'organiz', 'treasurer', 'initiative', 'coordinat'], q: 'Tell me about a time you took the lead or did something without being asked.' },
  { id: 'deadlines', words: ['deadline', 'prioriti', 'fast-paced', 'multiple', 'time management', 'organis', 'organiz'], ev: ['deadline', 'weekly', 'busy', 'schedule', 'multiple', 'monthly'], q: 'Tell me about a time you had several deadlines at once. How did you decide what to do first?' },
  { id: 'problem', words: ['problem', 'analytical', 'troubleshoot', 'solve', 'critical thinking', 'investigat'], ev: ['solved', 'resolved', 'troubleshoot', 'debug', 'fixed', 'reduced', 'improved', 'cutting', 'compared'], q: 'Tell me about a difficult problem you solved. How did you approach it?' },
  { id: 'learning', words: ['learn', 'curious', 'adapt', 'new tools', 'quickly', 'training'], ev: ['learned', 'self-taught', 'course', 'trained a'], q: 'Tell me about a time you had to learn something new quickly. How did you go about it?' },
  { id: 'detail', words: ['detail', 'accura', 'quality', 'precision', 'thorough'], ev: ['accura', 'documented', 'cleaned', 'validat', 'unit tests', 'checked'], q: 'Tell me about a time attention to detail mattered. What did you catch or prevent?' },
];
const DEFAULT_THEMES = ['teamwork', 'problem', 'deadlines'];

const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n - 1).trimEnd()}…` : String(s || ''));

function evidencePool(cv) {
  const out = [];
  for (const e of cv.experience || []) for (const b of e.bullets || []) if (b && b.trim()) out.push({ text: b.trim(), source: [e.role, e.company].filter(Boolean).join(' at ') || 'Experience' });
  for (const p of cv.projects || []) for (const b of p.bullets || []) if (b && b.trim()) out.push({ text: b.trim(), source: p.name ? `Project: ${p.name}` : 'Project' });
  return out;
}
const hasWord = (text, words) => { const t = String(text).toLowerCase(); return words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)); };
const NOISE = new Set(['graduate', 'scheme', 'analyse', 'analyze', 'communicate', 'findings', 'audiences', 'subject', 'quantitative', 'join', 'customer', 'looking', 'degree']);
const plain = (s) => String(s).replace(/\*\*/g, '');

function buildPrep({ cv, jobText, company }) {
  const co = (company || '').trim();
  const kws = jobKeywords(jobText);
  const cov = coverage(cv, kws);
  const pool = evidencePool(cv);
  const jd = String(jobText || '').toLowerCase();
  let n = 0;
  const item = (question, tip, evidence) => ({ id: `q${++n}`, question, tip, evidence: evidence ? { text: plain(evidence.text), source: evidence.source } : null });
  const sections = [];

  // 1. Opening questions
  const edu = (cv.education || [])[0];
  const latest = (cv.experience || [])[0];
  const topMatched = cov.matched.slice(0, 2);
  sections.push({
    title: 'Opening questions',
    intro: 'Almost every interview starts here. Have a short, clear answer ready for each.',
    items: [
      item('Tell me about yourself.',
        `Keep it to about a minute: where you are now${edu && (edu.degree || edu.school) ? ` (${[edu.degree, edu.school].filter(Boolean).join(', ')})` : ''}, ${latest && latest.role ? `what you did as ${latest.role}${latest.company ? ` at ${latest.company}` : ''}` : 'what you have done so far'}, and why this role is next.`),
      item(`Why do you want to work at ${co || 'this company'}?`,
        `Read their website first. Link two things they care about to your own experience${topMatched.length ? `, for example ${topMatched.join(' and ')}, which the job asks for` : ''}.`),
      item('Why this role?', 'Pick two or three things from the job description that you genuinely want to do, and give a reason for each.'),
      item('What are your strengths?', 'Choose two that the job needs and back each with one short example from your CV.'),
      item('What is a weakness you are working on?', 'Pick something real and not essential for the job, and say what you are doing about it.'),
      item('Do you have any questions for us?', 'Always have two or three ready. For example: What does a good first three months look like? How will my work be reviewed? What do you enjoy most about working here?'),
    ],
  });

  // 2. Skills the job asks for that the CV shows
  const used = new Set();
  const skillItems = [];
  const listed = [...(cv.skills || []).map((x) => `${x.label} ${x.items}`), ...(cv.projects || []).map((x) => x.tech || '')].join(' , ');
  const picked = [];
  for (const kw of kws) {
    if (skillItems.length >= 6) break;
    if (!cov.matched.includes(kw.display)) continue;
    const ws = kw.display.split(' ');
    if (ws.some((w) => NOISE.has(w) || w === 'non' || w === 'technical')) continue;
    if (picked.some((p) => ws.every((w) => p.includes(w)))) continue; // already covered by a longer phrase
    const inSkills = textScore(listed, [kw]).score > 0;
    const ev = pool.find((p) => !used.has(p.text) && textScore(p.text, [kw]).score > 0 && (inSkills || ws.length > 1));
    if (!ev && !inSkills) continue;
    if (ev) used.add(ev.text);
    picked.push(ws);
    skillItems.push(item(`The job mentions ${kw.display}. Tell me about a time you used it and what came out of it.`,
      ev ? 'Start from this line of your CV, then add the situation, what you personally did, and the result.'
        : 'Your CV lists this in your skills, so expect to be asked. Prepare one real example: what you did, and what happened.', ev));
  }
  if (skillItems.length) sections.push({ title: 'Skills the job asks for', intro: 'Your CV backs these up, so expect questions on them.', items: skillItems });

  // 3. Gaps
  const gapItems = cov.missing.filter((k) => k.split(' ').every((w) => w.length >= 4 && !NOISE.has(w))).slice(0, 4).map((k) => item(`The job mentions ${k}. What experience do you have with it?`,
    'Your CV does not mention this. Only claim what is true. If you have not used it, say so, describe the closest thing you have done, and explain how you would learn it.'));
  if (gapItems.length) sections.push({ title: 'Gaps to prepare for', intro: 'The job mentions these but your CV does not. Be ready to answer honestly.', items: gapItems });

  // 4. Behavioural questions the job description points to
  let themes = THEMES.filter((t) => t.words.some((w) => jd.includes(w))).slice(0, 5);
  for (const id of DEFAULT_THEMES) if (themes.length < 3 && !themes.some((t) => t.id === id)) themes.push(THEMES.find((t) => t.id === id));
  const behav = themes.map((t) => {
    const ev = pool.find((p) => !used.has(p.text) && hasWord(p.text, t.ev));
    if (ev) used.add(ev.text);
    return item(t.q, ev ? 'Use the STAR steps below. This line from your CV could be the core of your answer.' : 'Your CV has no line on this. Think of an example from university, work, a society or a project, and use the STAR steps below.', ev);
  });
  sections.push({ title: 'Behavioural questions', intro: 'Employers ask for examples. Answer each in four steps: Situation, Task, Action, Result.', items: behav });

  // 5. Questions about the CV itself
  const cvItems = [];
  for (const e of (cv.experience || []).slice(0, 3)) {
    if (e.role) cvItems.push(item(`Walk me through your role as ${e.role}${e.company ? ` at ${e.company}` : ''}. What are you most proud of?`, 'Pick one achievement and be ready to explain your part in it.'));
  }
  for (const p of pool.filter((x) => /\d/.test(x.text)).slice(0, 3)) {
    cvItems.push(item(`Your CV says: "${clip(plain(p.text), 140)}" How did you measure or work that out?`, 'Interviewers test numbers. Know where each one came from, and drop any you cannot explain.', p));
  }
  for (const p of (cv.projects || []).slice(0, 2)) {
    if (p.name) cvItems.push(item(`Tell me about ${p.name}. What was the hardest part, and what would you do differently?`, 'Describe a real obstacle and what you learned.'));
  }
  if (cvItems.length) sections.push({ title: 'Questions about your CV', intro: 'Interviewers pick lines from your CV and dig in.', items: cvItems });

  return {
    company: co,
    match: { score: cov.score, matched: cov.matched.slice(0, 12), missing: cov.missing },
    star: [
      ['Situation', 'Set the scene in one or two sentences. Where were you and what was happening?'],
      ['Task', 'What was your responsibility or goal?'],
      ['Action', 'What did you do, step by step? Say "I", not "we".'],
      ['Result', 'What happened? Use a number if you honestly have one, and say what you learned.'],
    ],
    sections,
    total: n,
  };
}

module.exports = { buildPrep };
