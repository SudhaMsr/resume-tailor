'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { jobKeywords, rank, coverage, strip } = require('../server/match');
const { tailorCv } = require('../server/tailor');

const fx = (f) => fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
const cv = JSON.parse(fx('sample-cv.json'));
const job = fx('job-data-analyst.txt');

test('job keywords pick up the technical terms', () => {
  const k = jobKeywords(job).map((x) => x.display);
  for (const want of ['sql', 'python', 'tableau']) assert.ok(k.includes(want), `missing ${want}`);
  assert.ok(!k.includes('experience') && !k.includes('team'));
});

test('relevant bullets rank first inside a role', () => {
  const { cv: ranked } = rank(cv, job);
  const first = ranked.experience[0].bullets[0];
  assert.match(first, /SQL|Tableau|Python/i);
});

test('skills rows with matching tools come first', () => {
  const { cv: ranked } = rank(cv, job);
  assert.ok(/Tableau|Power BI/.test(ranked.skills[0].items.split(',').slice(0, 2).join()));
});

test('tailoring never invents content', async () => {
  const r = await tailorCv({ cv, jobText: job, maxPages: 1 });
  const original = JSON.stringify(cv);
  const text = [r.cv.summary, ...r.cv.experience.flatMap((e) => [e.role, e.company, ...e.bullets]), ...r.cv.projects.flatMap((p) => [p.name, ...p.bullets])];
  for (const t of text) assert.ok(original.includes(JSON.stringify(t).slice(1, -1)), `not from the CV: ${t}`);
});

test('result fits the page limit and keeps education and heading', async () => {
  for (const maxPages of [1, 2]) {
    const r = await tailorCv({ cv, jobText: job, maxPages });
    assert.ok(r.pages <= maxPages);
    assert.strictEqual(r.cv.education.length, cv.education.length);
    assert.strictEqual(r.cv.basics.name, cv.basics.name);
  }
});

test('internal scoring fields are stripped', () => {
  const { cv: ranked } = rank(cv, job);
  assert.ok(!JSON.stringify(strip(ranked)).includes('_score'));
});

test('coverage reports a score and missing terms', () => {
  const { kws } = rank(cv, job);
  const c = coverage(cv, kws);
  assert.ok(c.score > 0 && c.score <= 100);
  assert.ok(Array.isArray(c.missing));
});
