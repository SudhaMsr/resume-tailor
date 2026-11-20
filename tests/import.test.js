'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { extractText } = require('../server/extract');
const { parseCvText } = require('../server/parse');
const { compileCv } = require('../server/compile');

const sample = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-cv.json'), 'utf8'));
const hasPdftotext = (() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();

// tiny zip writer so the test needs no packages
function zip(files) {
  const locals = []; const centrals = []; let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name); const raw = Buffer.from(content); const data = zlib.deflateRawSync(raw);
    const crc = zlib.crc32(raw);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    locals.push(lh, nameBuf, data); centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const para = (t, list) => `<w:p>${list ? '<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>' : ''}<w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`;
function docx(lines) {
  const body = lines.map((l) => (l.startsWith('* ') ? para(l.slice(2), true) : para(l))).join('');
  return zip({ 'word/document.xml': `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>` });
}

test('reads text and bullets from a Word file', async () => {
  const text = await extractText(docx(['Jane Example', 'Experience', 'Data Analyst Intern', '* Built dashboards & reports for the team']), 'cv.docx');
  assert.match(text, /Jane Example/);
  assert.match(text, /• Built dashboards & reports/);
});

test('Word CV with a different layout is parsed into sections', async () => {
  const file = docx([
    'Sam Student', 'sam@example.com | +44 7700 900123 | linkedin.com/in/samstudent', 'London, UK',
    'Summary', 'Final year student who likes data.',
    'Experience',
    'Data Analyst Intern', 'Northwind Analytics, Remote', 'June 2025 - September 2025',
    '* Built a dashboard that three teams used', '* Cleaned 50,000 records with Python',
    'Barista', 'Cafe Example', '2023 - Present', '* Served customers quickly',
    'Education', 'University of Examplehampton', 'BSc Computer Science', 'Sep 2022 - Jun 2025',
    'Skills', 'Languages: Python, SQL', 'Excel, Tableau',
    'Projects', 'Bike Map | JavaScript', '* Built a map of bike stations',
  ]);
  const { cv } = parseCvText(await extractText(file, 'cv.docx'));
  assert.strictEqual(cv.basics.name, 'Sam Student');
  assert.strictEqual(cv.basics.email, 'sam@example.com');
  assert.strictEqual(cv.basics.linkedin, 'samstudent');
  assert.strictEqual(cv.experience.length, 2);
  assert.strictEqual(cv.experience[0].role, 'Data Analyst Intern');
  assert.strictEqual(cv.experience[0].bullets.length, 2);
  assert.match(cv.experience[0].dates, /^June 2025 -- September 2025$/i);
  assert.strictEqual(cv.education.length, 1);
  assert.match(cv.education[0].school, /University/);
  assert.ok(cv.skills.some((s) => /Python/.test(s.items)));
  assert.strictEqual(cv.projects[0].name, 'Bike Map');
});

test('nothing is invented: every imported line comes from the file', async () => {
  const lines = ['Sam Student', 'Experience', 'Data Analyst Intern', 'Acme Ltd', 'Jan 2024 - Mar 2024', '* Wrote reports for managers'];
  const { cv } = parseCvText(await extractText(docx(lines), 'cv.docx'));
  const source = lines.join(' ');
  for (const t of [cv.experience[0].role, cv.experience[0].company, ...cv.experience[0].bullets]) assert.ok(source.includes(t), `not in source: ${t}`);
});

test('pasted text works and missing sections give warnings', () => {
  const r = parseCvText('Just some words with no headings at all, and nothing else to find here.');
  assert.ok(r.noSections);
  assert.ok(r.warnings.length > 0);
});

test('rejects non-CV files and old .doc files', async () => {
  await assert.rejects(() => extractText(Buffer.from('hello hello hello hello hello hello hello hello hello'), 'a.bin'), /PDF or Word/);
  const olddoc = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(100)]);
  await assert.rejects(() => extractText(olddoc, 'a.doc'), /\.docx/);
});

test('PDF made by our own template round-trips', { skip: !hasPdftotext }, async () => {
  const { pdf } = await compileCv(sample);
  const { cv, warnings } = parseCvText(await extractText(pdf, 'cv.pdf'));
  assert.deepStrictEqual(warnings, []);
  assert.strictEqual(cv.basics.name, 'Jane Example');
  assert.strictEqual(cv.basics.email, 'jane.example@example.com');
  assert.strictEqual(cv.experience.length, sample.experience.length);
  assert.strictEqual(cv.experience[0].company, 'Northwind Analytics');
  assert.strictEqual(cv.experience[0].dates, 'Jun 2025 -- Sep 2025');
  assert.strictEqual(cv.experience[0].bullets.length, 5);
  assert.strictEqual(cv.education.length, 2);
  assert.strictEqual(cv.projects.length, 3);
  assert.strictEqual(cv.certifications.length, 3);
  assert.strictEqual(cv.skills.length, 4);
});
