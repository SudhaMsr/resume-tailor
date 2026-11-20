'use strict';
const test = require('node:test');
const assert = require('node:assert');
const T = require('../web/tracker.js');

test('makeApp needs company and role, and only keeps http(s) links', () => {
  assert.strictEqual(T.makeApp({ company: 'Acme' }), null);
  const a = T.makeApp({ company: ' Acme ', role: 'Analyst', link: 'javascript:alert(1)', status: 'Nope' });
  assert.strictEqual(a.company, 'Acme');
  assert.strictEqual(a.link, '');
  assert.strictEqual(a.status, 'Saved');
  assert.strictEqual(T.makeApp({ company: 'A', role: 'B', link: 'https://x.co/job' }).link, 'https://x.co/job');
  assert.strictEqual(a.checks.length, T.CHECKLIST.length);
});

test('dueState flags overdue and today follow-ups, not closed ones', () => {
  const day = '2026-11-20T10:00:00Z';
  assert.strictEqual(T.dueState({ status: 'Applied', followUp: '2026-11-19' }, day), 'overdue');
  assert.strictEqual(T.dueState({ status: 'Applied', followUp: '2026-11-20' }, day), 'today');
  assert.strictEqual(T.dueState({ status: 'Applied', followUp: '2026-11-25' }, day), '');
  assert.strictEqual(T.dueState({ status: 'Rejected', followUp: '2026-11-01' }, day), '');
  assert.strictEqual(T.dueState({ status: 'Applied' }, day), '');
});

test('counts and checklist progress', () => {
  const c = T.counts([{ status: 'Applied' }, { status: 'Applied' }, { status: 'Offer' }, { status: 'bogus' }]);
  assert.deepStrictEqual([c.Applied, c.Offer, c.Saved], [2, 1, 0]);
  assert.deepStrictEqual(T.progress({ checks: [true, false, true] }), { done: 2, total: T.CHECKLIST.length });
});
