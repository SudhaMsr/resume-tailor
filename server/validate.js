'use strict';
// Shape + size validation for CVs coming from the browser. Unknown fields are dropped.
const LIMITS = { str: 1500, bullets: 12, entries: 20, skills: 12 };

const s = (v) => (typeof v === 'string' ? v.slice(0, LIMITS.str) : '');
const arr = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

function sanitizeCv(cv) {
  const c = cv && typeof cv === 'object' ? cv : {};
  const b = c.basics && typeof c.basics === 'object' ? c.basics : {};
  const pair = (x) => ({ name: s(x && x.name), issuer: s(x && x.issuer) });
  return {
    basics: Object.fromEntries(['name', 'title', 'phone', 'email', 'linkedin', 'github', 'location', 'extra'].map((k) => [k, s(b[k])])),
    summary: s(c.summary),
    skills: arr(c.skills, LIMITS.skills).map((x) => ({ label: s(x && x.label), items: Array.isArray(x && x.items) ? x.items.map(s).join(', ') : s(x && x.items) })),
    experience: arr(c.experience, LIMITS.entries).map((x) => ({ role: s(x && x.role), company: s(x && x.company), location: s(x && x.location), dates: s(x && x.dates), type: s(x && x.type), bullets: arr(x && x.bullets, LIMITS.bullets).map(s) })),
    projects: arr(c.projects, LIMITS.entries).map((x) => ({ name: s(x && x.name), tech: s(x && x.tech), dates: s(x && x.dates), bullets: arr(x && x.bullets, LIMITS.bullets).map(s) })),
    certifications: arr(c.certifications, 30).map(pair),
    education: arr(c.education, 6).map((x) => ({ school: s(x && x.school), degree: s(x && x.degree), location: s(x && x.location), dates: s(x && x.dates), details: arr(x && x.details, LIMITS.bullets).map(s) })),
    competitions: arr(c.competitions, 30).map(pair),
    activities: arr(c.activities, 30).map(pair),
  };
}

module.exports = { sanitizeCv };
