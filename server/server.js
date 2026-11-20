'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { compileCv, FULL_FONTS } = require('./compile');
const { tailorCv } = require('./tailor');
const { sanitizeCv } = require('./validate');
const { cvFileName } = require('./render');
const { extractText } = require('./extract');
const { parseCvText } = require('./parse');

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
const WEB_DIR = path.join(__dirname, '..', 'web');
const MAX_BODY = 300 * 1024;
const MAX_JOB = 20000;
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 2);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

// --- tiny concurrency gate so a burst of users cannot exhaust the server
let active = 0;
const waiting = [];
async function gate(fn) {
  if (active >= MAX_CONCURRENT) await new Promise((r) => waiting.push(r));
  active++;
  try { return await fn(); } finally { active--; const n = waiting.shift(); if (n) n(); }
}

// --- simple in-memory rate limit: 40 requests / minute / IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > 40;
}

function send(res, status, body, headers = {}) {
  const common = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...(ALLOWED_ORIGIN ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Headers': 'content-type, x-filename', 'Access-Control-Expose-Headers': 'X-Pages, Content-Disposition' } : {}),
  };
  res.writeHead(status, { ...common, ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Request too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('That file is too big (limit 3 MB).'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Upload (PDF/DOCX as raw bytes) or pasted text (JSON {text}) -> CV for the student to review.
async function handleImport(req, res) {
  const isJson = String(req.headers['content-type'] || '').startsWith('application/json');
  let text; let buf; let filename = '';
  if (isJson) {
    const body = await readBody(req);
    text = typeof body.text === 'string' ? body.text.slice(0, 60000) : '';
    if (text.trim().length < 40) return json(res, 400, { error: 'Please paste more of your CV text.' });
  } else {
    buf = await readRaw(req, 3 * 1024 * 1024 + 1024);
    try { filename = decodeURIComponent(String(req.headers['x-filename'] || '')).slice(0, 200); } catch (e) { filename = ''; }
  }
  const result = await gate(async () => {
    if (text === undefined) text = await extractText(buf, filename);
    let r = parseCvText(text);
    if (buf && r.noSections) { try { const raw = await extractText(buf, filename, { layout: false }); const r2 = parseCvText(raw); if (!r2.noSections) r = r2; } catch (e) { /* keep first result */ } }
    return r;
  });
  return json(res, 200, { cv: sanitizeCv(result.cv), warnings: result.warnings });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/import') return handleImport(req, res);
  const body = await readBody(req);
  if (url.pathname === '/api/tailor') {
    const jobText = typeof body.job === 'string' ? body.job.slice(0, MAX_JOB) : '';
    if (jobText.trim().length < 40) return json(res, 400, { error: 'Please paste the job description (at least a few lines).' });
    const maxPages = body.maxPages === 1 ? 1 : 2;
    const cv = sanitizeCv(body.cv);
    if (!cv.basics.name.trim()) return json(res, 400, { error: 'Your CV needs a name.' });
    const result = await gate(() => tailorCv({ cv, jobText, maxPages }));
    return json(res, 200, result);
  }
  if (url.pathname === '/api/render') {
    const cv = sanitizeCv(body.cv);
    const out = await gate(() => compileCv(cv));
    const name = cvFileName(body.company, cv.basics.name);
    return send(res, 200, out.pdf, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Pages': String(out.pages),
    });
  }
  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(WEB_DIR, rel));
  if (!file.startsWith(WEB_DIR + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (url.pathname === '/health') return json(res, 200, { ok: true, fullFonts: FULL_FONTS });
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' });
      const ip = req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress;
      if (limited(ip)) return json(res, 429, { error: 'Too many requests. Please wait a minute.' });
      return await handleApi(req, res, url);
    }
    if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
    return serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    return json(res, status, { error: status === 500 ? (e.log ? `PDF build failed: ${e.log}` : 'Something went wrong. Please try again.') : e.message });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Resume Tailor listening on :${PORT} (full fonts: ${FULL_FONTS})`));
}
module.exports = { server };
