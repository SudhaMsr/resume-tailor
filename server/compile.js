'use strict';
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renderLatex } = require('./render');

// Detect whether Lato + FontAwesome are installed (they are in the Docker image).
function detectFullFonts() {
  if (process.env.LATEX_SIMPLE === '1') return false;
  try {
    const r = spawnSync('kpsewhich', ['lato.sty', 'fontawesome5.sty'], { encoding: 'utf8' });
    const found = (r.stdout || '').split('\n').filter(Boolean);
    return found.length >= 2;
  } catch (e) {
    return false;
  }
}

const FULL_FONTS = detectFullFonts();

function run(cmd, args, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stdout.on('data', (d) => { out += d; if (out.length > 200000) out = out.slice(-100000); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => { clearTimeout(t); resolve({ code, out }); });
    p.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out: String(e) }); });
  });
}

async function compileCv(cv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cv-'));
  try {
    const tex = renderLatex(cv, { fullFonts: FULL_FONTS });
    fs.writeFileSync(path.join(dir, 'resume.tex'), tex);
    const args = ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', 'resume.tex'];
    // two passes so hyperref/page references settle
    let r = await run('pdflatex', args, dir, 30000);
    if (r.code === 0) r = await run('pdflatex', args, dir, 30000);
    const pdfPath = path.join(dir, 'resume.pdf');
    if (r.code !== 0 || !fs.existsSync(pdfPath)) {
      const err = new Error('PDF compile failed');
      err.log = r.out.split('\n').filter((l) => l.startsWith('!') || /error/i.test(l)).slice(0, 8).join('\n');
      throw err;
    }
    const pdf = fs.readFileSync(pdfPath);
    const m = /Output written on .*?\((\d+) pages?/.exec(r.out);
    const pages = m ? Number(m[1]) : 0;
    return { pdf, pages, tex };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { compileCv, FULL_FONTS };
