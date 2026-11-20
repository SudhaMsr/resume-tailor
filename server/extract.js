'use strict';
// Turns an uploaded CV file (PDF or DOCX) into plain text. No third-party packages:
// PDF goes through poppler's pdftotext; DOCX is a zip that we read with node:zlib.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFile } = require('node:child_process');

const MAX_FILE = 3 * 1024 * 1024;
const MAX_XML = 8 * 1024 * 1024;
const MAX_TEXT = 60000;

function fail(msg) { return Object.assign(new Error(msg), { status: 400 }); }

function kindOf(buf, filename) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4) return 'docx';
  if (buf.length >= 8 && buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') return 'doc';
  return /\.txt$/i.test(filename || '') ? 'txt' : null;
}

function pdfToText(buf, layout = true) {
  return new Promise(async (resolve, reject) => {
    let dir;
    try {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cvimp-'));
      const file = path.join(dir, 'in.pdf');
      await fs.writeFile(file, buf);
      execFile('pdftotext', [...(layout ? ['-layout'] : []), '-enc', 'UTF-8', '-nopgbrk', file, '-'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, async (err, stdout) => {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        if (err) return reject(fail('Could not read that PDF. If it is password protected or a scan, export a normal PDF or paste the text instead.'));
        resolve(String(stdout));
      });
    } catch (e) {
      if (dir) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      reject(e);
    }
  });
}

// Minimal zip reader: find one entry by name via the central directory.
function zipEntry(buf, wanted) {
  const eocdMin = Math.max(0, buf.length - 65557);
  let e = -1;
  for (let i = buf.length - 22; i >= eocdMin; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; } }
  if (e < 0) throw fail('That Word file looks damaged.');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === wanted) {
      if (local + 30 > buf.length) break;
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_XML });
      break;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw fail('That does not look like a Word (.docx) CV.');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, g) => {
  if (g[0] === '#') { const cp = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; }
  return ENT[g] != null ? ENT[g] : m;
});

function docxToText(buf) {
  const xml = zipEntry(buf, 'word/document.xml').toString('utf8');
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
  const lines = [];
  for (const p of paras) {
    const isList = /<w:numPr>/.test(p);
    let t = '';
    for (const m of p.matchAll(/<w:tab\s*\/>|<w:(?:br|cr)\b[^>]*\/>|<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
      if (m[1] !== undefined) t += unxml(m[1]);
      else t += m[0].startsWith('<w:tab') ? '\t' : '\n';
    }
    for (const [i, line] of t.split('\n').entries()) lines.push((isList && i === 0 ? '• ' : '') + line);
  }
  return lines.join('\n');
}

async function extractText(buf, filename, opts = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw fail('That file is empty.');
  if (buf.length > MAX_FILE) throw Object.assign(new Error('That file is too big (limit 3 MB).'), { status: 413 });
  const kind = kindOf(buf, filename);
  if (kind === 'doc') throw fail('Old .doc files are not supported. Please save it as .docx or PDF and upload again.');
  if (!kind) throw fail('Please upload a PDF or Word (.docx) file.');
  const text = kind === 'pdf' ? await pdfToText(buf, opts.layout !== false) : kind === 'docx' ? docxToText(buf) : buf.toString('utf8');
  const clean = text.replace(/\r/g, '').replace(/\u00a0/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, MAX_TEXT);
  if (clean.trim().length < 40) throw fail('I could not find any text in that file. If it is a scan or image, paste the text instead.');
  return clean;
}

module.exports = { extractText, docxToText, kindOf };
