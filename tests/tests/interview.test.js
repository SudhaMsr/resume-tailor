'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { buildPrep } = require('../server/interview');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const cv = JSON.parse(fx('sample-cv.json'));
const job = fx('job-data-analyst.txt');

test('prep has the standard sections and uses the company name', () => {
  const r = buildPrep({ cv, jobText: job, company: 'Acme Ltd' });
  const titles = r.sections.map((s) => s.title);
  for (const t of ['Opening questions', 'Skills the job asks for', 'Behavioural questions', 'Questions about your CV']) assert.ok(titles.includes(t), t);
  assert.ok(r.sections[0].items.some((q) => q.question.includes('Acme Ltd')));
  assert.strictEqual(r.total, r.sections.reduce((n, s) => n + s.items.length, 0));
  assert.strictEqual(new Set(r.sections.flatMap((s) => s.items.map((q) => q.id))).size, r.total);
});

test('evidence lines are copied from the CV, never invented', () => {
  const r = buildPrep({ cv, jobText: job, company: 'Acme' });
  const source = JSON.stringify(cv).replace(/\*\*/g, '');
  const withEvidence = r.sections.flatMap((s) => s.items).filter((q) => q.evidence);
  assert.ok(withEvidence.length > 3);
  for (const q of withEvidence) assert.ok(source.includes(JSON.stringify(q.evidence.text).slice(1, -1)), `not from CV: ${q.evidence.text}`);
});

test('skills the job asks for are tied to real CV lines or listed skills', () => {
  const r = buildPrep({ cv, jobText: job, company: '' });
  const skills = r.sections.find((s) => s.title === 'Skills the job asks for').items;
  assert.ok(skills.some((q) => /sql/i.test(q.question) && q.evidence));
  assert.ok(skills.some((q) => /tableau/i.test(q.question)));
});

test('gaps only list things the CV does not mention', () => {
  const r = buildPrep({ cv, jobText: job, company: '' });
  const gaps = (r.sections.find((s) => s.title === 'Gaps to prepare for') || { items: [] }).items;
  const cvText = JSON.stringify(cv).toLowerCase();
  for (const q of gaps) assert.ok(!cvText.includes(q.question.match(/mentions (.+?)\./)[1].toLowerCase()), q.question);
});

test('a nearly empty CV still gets sensible questions', () => {
  const r = buildPrep({ cv: { basics: { name: 'A' } }, jobText: job, company: '' });
  assert.ok(r.total >= 8);
  assert.ok(r.sections.every((s) => s.items.length > 0));
});
