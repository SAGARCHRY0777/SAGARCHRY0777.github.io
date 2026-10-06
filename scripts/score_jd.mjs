// Score a job description against Sagar's real profile.
//
//   node 05_website/scripts/score_jd.mjs path/to/jd.txt
//   cat jd.txt | node 05_website/scripts/score_jd.mjs
//
// Reuses the site's match.js, so the numbers here are exactly what the MATCH
// console on the live site produces — one implementation, not two. Gaps are
// printed as loudly as hits: a term he does not have is a gap, never a match.

import { readFileSync } from 'node:fs';

// minimal DOM so the browser module can be imported outside a browser
const mq = { matches: false, addEventListener() {} };
globalThis.window = { matchMedia: () => mq, addEventListener() {}, innerWidth: 1440, innerHeight: 900 };
globalThis.document = {
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: {}, getAttribute: () => null, setAttribute() {} },
  readyState: 'complete',
};
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;
globalThis.IntersectionObserver = class { observe() {} disconnect() {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });

const { scoreJD } = await import('../js/match.js');

async function readInput() {
  const file = process.argv[2];
  if (file) return readFileSync(file, 'utf8');
  if (process.stdin.isTTY) {
    console.error('usage: node score_jd.mjs <jd-file>   (or pipe the JD on stdin)');
    process.exit(2);
  }
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const jd = await readInput();
const r = scoreJD(jd);

if (!r) {
  console.error('Not enough text to score — paste the full description.');
  process.exit(1);
}

const VARIANT_FILE = {
  master: 'R0-Master', industrial: 'R1-Industrial-IIoT', genai: 'R2-GenAI-LLM',
  cv: 'R3-CV-Perception', mlops: 'R4-MLOps-Platform', backend: 'R5-Backend-ML',
};

const bar = (n) => '█'.repeat(Math.round(n / 4)).padEnd(25, '·');

console.log('');
console.log(`  COVERAGE   ${String(r.score).padStart(3)} / 100   ${bar(r.score)}`);
console.log(`  RESUME     ${r.variantLabel}`);
console.log(`             02_resumes/Sagar_Chaudhary_${VARIANT_FILE[r.variant] || 'R0-Master'}.pdf`);
console.log('');

console.log(`  MATCHED (${r.hits.length}) — terms he can evidence from profile.json`);
if (r.hits.length) {
  const names = r.hits.map(([t]) => t);
  for (let i = 0; i < names.length; i += 6) {
    console.log('    ' + names.slice(i, i + 6).join(', '));
  }
} else {
  console.log('    none — this JD shares no vocabulary with his profile');
}
console.log('');

console.log(`  GAPS (${r.gaps.length}) — asked for, and genuinely absent. Do NOT add these.`);
console.log(r.gaps.length ? '    ' + r.gaps.join(', ') : '    none detected');
console.log('');

const domains = Object.entries(r.domainScore).sort((a, b) => b[1] - a[1]);
console.log('  DOMAIN SIGNAL');
domains.forEach(([k, v]) => {
  if (v) console.log(`    ${k.padEnd(12)} ${'▪'.repeat(v)} ${v}`);
});
console.log('');

console.log('  EVIDENCE — real bullets to lead with for this domain');
r.evidence.forEach((e) => {
  const wrapped = e.match(/.{1,86}(\s|$)/g) || [e];
  console.log('    - ' + wrapped.join('\n      ').trim());
});
console.log('');

// A blunt read, so the number is never mistaken for a verdict on its own.
const verdict =
  r.score >= 75 ? 'Strong match. Apply, and lead with the domain evidence above.'
  : r.score >= 50 ? 'Partial match. Worth applying, but expect the gaps to be probed.'
  : r.score >= 25 ? 'Weak match. Only worth it if the role itself is a genuine step up.'
  : 'Poor match. This JD wants a different engineer. Skip it.';
console.log(`  READ       ${verdict}`);
console.log('');
console.log('  Coverage is keyword overlap only. It says nothing about years of');
console.log('  experience, which is the filter that actually rejects him most often.');
console.log('');
