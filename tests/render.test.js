'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { escapeLatex, renderLatex, cvFileName } = require('../server/render');
const { compileCv } = require('../server/compile');
const { sanitizeCv } = require('../server/validate');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-cv.json'), 'utf8'));

test('escapes LaTeX special characters', () => {
  assert.strictEqual(escapeLatex('R&D 50% #1 $5 a_b {x}'), 'R\\&D 50\\% \\#1 \\$5 a\\_b \\{x\\}');
  assert.ok(!/\\write18|\\input/.test(escapeLatex('\\write18{ls} \\input{/etc/passwd}').replace(/\\textbackslash\{\}/g, '')));
});

test('smart punctuation and unsupported symbols are handled', () => {
  assert.strictEqual(escapeLatex('\u201Cquote\u201D \u2013 dash'), "``quote'' -- dash");
  assert.strictEqual(escapeLatex('rocket \u{1F680} ok'), 'rocket ok');
});

test('file name follows Company_Name_CV', () => {
  assert.strictEqual(cvFileName('Acme Ltd', 'Jane Example'), 'Acme_Ltd_Jane_Example_CV.pdf');
  assert.strictEqual(cvFileName('../../etc', 'A/B'), 'etc_AB_CV.pdf');
});

test('hostile input still compiles and never runs commands', async () => {
  const cv = sanitizeCv(sample);
  cv.basics.name = 'Evil \\write18{touch /tmp/pwned} $x$ & %';
  cv.summary = '\\input{/etc/passwd} \\end{document} {{{ ^_^ ~ #';
  cv.experience[0].bullets[0] = '\\immediate\\write18{id} **bold** 100% & more_text';
  cv.basics.email = 'a@b.co}{\\write18{id}';
  const { pdf, pages } = await compileCv(cv);
  assert.ok(pdf.length > 1000);
  assert.ok(pages >= 1);
  assert.ok(!fs.existsSync('/tmp/pwned'));
});

test('invalid email is dropped from the heading', () => {
  const tex = renderLatex({ basics: { name: 'A', email: 'x}{\\bad' } }, { fullFonts: false });
  assert.ok(!tex.includes('mailto'));
});

test('empty sections are omitted', () => {
  const tex = renderLatex({ basics: { name: 'A' }, experience: [] }, { fullFonts: false });
  assert.ok(!tex.includes('\\section{Experience}'));
});
