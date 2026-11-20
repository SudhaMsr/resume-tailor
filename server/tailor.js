'use strict';
const { rank, coverage, strip, removalOrder, trimWith } = require('./match');
const { compileCv } = require('./compile');

// Pipeline: rank the student's content against the job, then find the smallest
// amount of trimming that makes the real compiled PDF fit the page limit
// (binary search over the removal order, verified with the actual LaTeX build).
//
// `rewriter` is an optional async (cv, jobText) => cv hook. It is where a
// self-hosted language model plugs in later. It is off by default.
async function tailorCv({ cv, jobText, maxPages = 2, rewriter = null }) {
  const { cv: ranked, kws } = rank(cv, jobText);
  let working = ranked;
  if (rewriter) working = await rewriter(working, jobText);

  const order = removalOrder(working);
  const pagesFor = async (k) => (await compileCv(strip(trimWith(working, order, k)))).pages;

  let k = 0;
  const full = await pagesFor(0);
  if (full > maxPages) {
    let lo = 0;               // known not to fit
    let hi = order.length;    // assumed to fit (checked below)
    const atMax = await pagesFor(hi);
    if (atMax > maxPages) {
      const e = new Error('Even the shortest version does not fit the page limit. Shorten the heading, summary or education details.');
      e.status = 422;
      throw e;
    }
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((await pagesFor(mid)) <= maxPages) hi = mid; else lo = mid;
    }
    k = hi;
  }
  const finalCv = strip(trimWith(working, order, k));
  const built = await compileCv(finalCv);
  const report = coverage(finalCv, kws);
  return { cv: finalCv, pages: built.pages, removed: k, report, keywords: kws.slice(0, 20).map((x) => x.display) };
}

module.exports = { tailorCv };
