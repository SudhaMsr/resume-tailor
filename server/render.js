'use strict';
// Turns a CV JSON object into a LaTeX document that matches the Overleaf layout
// (sb2nov / Audric Serador resume, MIT licence). All user text is escaped.

const MAX_FIELD = 2000;

const REPLACEMENTS = new Map([
  ['\u201C', "``"], ['\u201D', "''"], ['\u2018', "`"], ['\u2019', "'"],
  ['\u2013', '--'], ['\u2014', '---'], ['\u2026', '\\ldots{}'],
  ['\u00A0', ' '], ['\u2022', '-'], ['\u2212', '-'], ['\u200B', ''],
  ['\u00B7', '\\textperiodcentered{}'],
  ['\uFB01', 'fi'], ['\uFB02', 'fl'], ['\uFB00', 'ff'], ['\uFB03', 'ffi'], ['\uFB04', 'ffl'],
]);

const SPECIAL = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
};

function escapeLatex(input) {
  let s = String(input == null ? '' : input).slice(0, MAX_FIELD);
  s = s.replace(/\r/g, '');
  let out = '';
  for (const ch of s) {
    if (REPLACEMENTS.has(ch)) { out += REPLACEMENTS.get(ch); continue; }
    if (SPECIAL[ch]) { out += SPECIAL[ch]; continue; }
    const cp = ch.codePointAt(0);
    // keep printable ASCII, tab/newline as space, and Latin letters pdfLaTeX can typeset
    if (ch === '\n' || ch === '\t') { out += ' '; continue; }
    if ((cp >= 32 && cp < 127) || (cp >= 0xC0 && cp <= 0x24F)) { out += ch; continue; }
    // anything else (emoji, symbols, control characters) is dropped
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

// **bold** markers in bullets become \textbf{...}; applied after escaping
function inline(input) {
  return escapeLatex(input).replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}');
}

function safeUrlPart(value, pattern) {
  const v = String(value || '').trim();
  return pattern.test(v) ? v : '';
}

function list(v) { return Array.isArray(v) ? v : []; }
function str(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function nonEmpty(v) { return str(v).trim().length > 0; }

function preamble(opts) {
  const fancy = opts.fullFonts;
  return String.raw`%-------------------------
% Resume in LaTeX
% Layout: Audric Serador, inspired by https://github.com/sb2nov/resume (MIT)
%------------------------

\documentclass[letterpaper,11pt]{article}

${fancy ? '\\usepackage{fontawesome5}' : ''}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

${fancy ? '% Custom font\n\\usepackage[default]{lato}' : '% (Lato font not available in this build)'}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule\vspace{-5pt}]

% Ensure that generated pdf is machine readable/ATS parsable
\pdfgentounicode=1

%-------------------------%
% Custom commands
\newcommand{\resumeItem}[1]{
\item\small{
{#1 \vspace{-2pt}}
}
}

\newcommand{\resumeSubheading}[4]{
\vspace{-2pt}\item
\begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
\textbf{#1} & #2 \\
\textit{\small#3} & \textit{\small #4} \\
\end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
\item
\begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
\textit{\small#1} & \textit{\small #2} \\
\end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
\item
\begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
\small#1 & #2 \\
\end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\definecolor{Black}{RGB}{0, 0, 0}
${fancy
    ? '\\newcommand{\\seticon}[1]{\\textcolor{Black}{\\csname #1\\endcsname}}'
    : '\\newcommand{\\seticon}[1]{}'}
`;
}

function heading(b, opts) {
  const parts = [];
  const icon = (name) => (opts.fullFonts ? `\\seticon{${name}} ` : '');
  const small = [];
  if (nonEmpty(b.phone)) small.push(`${icon('faPhone')}${opts.fullFonts ? '\\ ' : ''}\\small ${escapeLatex(b.phone)}`);
  const email = safeUrlPart(b.email, /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/);
  if (email) {
    parts.push(`\\href{mailto:${email.replace(/%/g, '\\%')}}{${icon('faEnvelope')}\\underline{${escapeLatex(email)}}}`);
  }
  const li = safeUrlPart(b.linkedin, /^[A-Za-z0-9._\-\/]{2,80}$/);
  if (li) {
    const handle = li.replace(/^(https?:\/\/)?(www\.)?linkedin\.com\/(in\/)?/i, '');
    parts.push(`\\href{https://www.linkedin.com/in/${handle}/}{${icon('faLinkedin')}\\underline{linkedin.com/${escapeLatex(handle)}}}`);
  }
  const gh = safeUrlPart(b.github, /^[A-Za-z0-9._\-\/]{2,80}$/);
  if (gh) {
    const handle = gh.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '');
    parts.push(`\\href{https://github.com/${handle}}{${icon('faGithub')}\\underline{github.com/${escapeLatex(handle)}}}`);
  }
  if (nonEmpty(b.location)) parts.push(`{${icon('faMapMarker')}\\underline{${escapeLatex(b.location)}}}`);
  if (nonEmpty(b.extra)) parts.push(`{\\underline{${escapeLatex(b.extra)}}}`);

  const all = [...small, ...parts];
  const contact = all.length
    ? (small.length ? '' : '\\small ') + all.join(' \\quad\n')
    : '';
  return `%----------HEADING----------%
\\begin{center}
\\textbf{\\Huge \\scshape ${escapeLatex(b.name) || 'Your Name'}} \\\\
${nonEmpty(b.title) ? `\\textbf{\\scshape ${escapeLatex(b.title)}}\\\\\n` : ''}\\vspace{1pt}
${contact}
\\end{center}
`;
}

function itemList(items) {
  const rows = list(items).filter(nonEmpty);
  if (!rows.length) return '';
  return `\\resumeItemListStart\n${rows.map((t) => `\\resumeItem{${inline(t)}}`).join('\n')}\n\\resumeItemListEnd\n`;
}

function summary(text) {
  if (!nonEmpty(text)) return '';
  return `%====================
% Objective Statement
%====================
\\section{Professional Summary}
${inline(text)}
`;
}

function skills(rows) {
  const r = list(rows).filter((x) => x && nonEmpty(x.label) && nonEmpty(x.items));
  if (!r.length) return '';
  const lines = r.map((x) => `\\textbf{${escapeLatex(x.label)}}{: ${escapeLatex(Array.isArray(x.items) ? x.items.join(', ') : x.items)}}`);
  return `%-----------TECHNICAL SKILLS-----------%
\\section{Technical Skills}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{
${lines.join(' \\\\\n')}
}}
\\end{itemize}
`;
}

function experience(rows) {
  const r = list(rows).filter((x) => x && (nonEmpty(x.role) || nonEmpty(x.company)));
  if (!r.length) return '';
  const body = r.map((x) => {
    const place = [x.company, x.location].filter(nonEmpty).map(escapeLatex).join(' \u00B7 ');
    return `\\resumeSubheading\n{${escapeLatex(x.role)}}{${escapeLatex(x.dates)}}\n{${place}}{${escapeLatex(x.type)}}\n${itemList(x.bullets)}`;
  }).join('\n');
  return `%-----------EXPERIENCE-----------%
\\section{Experience}
\\resumeSubHeadingListStart

${body}
\\resumeSubHeadingListEnd
`;
}

function projects(rows) {
  const r = list(rows).filter((x) => x && nonEmpty(x.name));
  if (!r.length) return '';
  const body = r.map((x) => {
    const tech = nonEmpty(x.tech) ? ` $|$ \\emph{${escapeLatex(x.tech)}}` : '';
    return `\\resumeProjectHeading\n{\\textbf{${escapeLatex(x.name)}}${tech}} {${escapeLatex(x.dates)}}\n${itemList(x.bullets)}`;
  }).join('\n');
  return `%-----------PROJECTS-----------%
\\section{Projects}
\\resumeSubHeadingListStart

${body}
\\resumeSubHeadingListEnd
`;
}

// Certifications, Competitions and Activities share one layout in the template:
// bold name, then " - issuer", one per line.
function labelSection(title, rows) {
  const r = list(rows)
    .map((x) => (typeof x === 'string' ? { name: x, issuer: '' } : x))
    .filter((x) => x && nonEmpty(x.name));
  if (!r.length) return '';
  const lines = r.map((x) => `\\textbf{${escapeLatex(x.name)}}${nonEmpty(x.issuer) ? `{ - ${escapeLatex(x.issuer)}}` : ''}`);
  return `%-----------${title.toUpperCase()}-----------%
\\section{${escapeLatex(title)}}
\\begin{itemize}[leftmargin=0.15in, label={}]
\\small{\\item{
${lines.join(' \\\\\n')}
}}
\\end{itemize}
`;
}

function education(rows) {
  const r = list(rows).filter((x) => x && (nonEmpty(x.school) || nonEmpty(x.degree)));
  if (!r.length) return '';
  // template order: {school}{dates} / {degree}{location}
  const body = r.map((x) => `\\resumeSubheading\n{${escapeLatex(x.school)}}{${escapeLatex(x.dates)}}\n{${escapeLatex(x.degree)}}{${escapeLatex(x.location)}}\n${itemList(x.details)}`).join('\n');
  return `%-----------EDUCATION-----------%
\\section{Education}
\\resumeSubHeadingListStart

${body}
\\resumeSubHeadingListEnd
`;
}

function renderLatex(cv, opts = {}) {
  const o = { fullFonts: opts.fullFonts !== false };
  const c = cv && typeof cv === 'object' ? cv : {};
  const sections = [
    heading(c.basics || {}, o),
    summary(c.summary),
    skills(c.skills),
    experience(c.experience),
    projects(c.projects),
    labelSection('Courses and Certifications', c.certifications),
    education(c.education),
    labelSection('Competitions and Hackathons', c.competitions),
    labelSection('Activities', c.activities),
  ].filter(Boolean);
  return `${preamble(o)}
\\begin{document}

${sections.join('\n')}
\\end{document}
`;
}

// "Company_Their_Name_CV" style file name
function cvFileName(company, name) {
  const clean = (s) => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_').slice(0, 40);
  const parts = [clean(company), clean(name), 'CV'].filter(Boolean);
  return `${parts.join('_')}.pdf`;
}

module.exports = { renderLatex, escapeLatex, cvFileName };
