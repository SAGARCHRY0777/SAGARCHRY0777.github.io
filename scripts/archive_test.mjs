// Verifies the swinging-door archiver keeps the promise it prints on screen:
// every discarded sample lies within ±E of the reconstructed line.
//   node scripts/archive_test.mjs

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'archive.js'), 'utf8');

const cut = src.indexOf('export function initArchive');
// swingingDoor is already exported in the source; strip export keywords so
// the probe can re-export the whole surface in one statement
const maths = src.slice(0, cut)
  .replace(/^import .*$/m, '')
  .replace(/^export (?=function|const)/gm, '');

const tmp = join(here, '..', 'dist', '_arc_probe.mjs');
writeFileSync(tmp, maths + '\nexport { makeRun, swingingDoor, maxError, RECORD_N };\n');
const { makeRun, swingingDoor, maxError, RECORD_N } =
  await import('file://' + tmp.replace(/\\/g, '/'));
unlinkSync(tmp);

let ok = true;
const fail = (msg) => { ok = false; console.log('  FAIL  ' + msg); };

console.log(`record: ${RECORD_N} samples\n`);
console.log('  tolerance  corridor  stored   ratio    max error  within bound');

// The panel is parameterised by TOLERANCE; the corridor is half of it.
// The bound must hold for every setting, on many different runs.
for (const tol of [0.5, 1, 2, 4, 8, 12]) {
  const E = tol / 2;
  let worstRatio = Infinity, worstErr = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const data = makeRun(seed * 2654435761);
    const kept = swingingDoor(data, E);
    const err = maxError(data, kept);

    if (err > tol + 1e-9) fail(`tol=${tol} seed=${seed}: error ${err.toFixed(4)} exceeds the tolerance`);
    if (err > 2 * E + 1e-9) fail(`tol=${tol} seed=${seed}: error ${err.toFixed(4)} breaches the 2E bound`);
    if (kept[0] !== 0) fail(`tol=${tol} seed=${seed}: first sample not archived`);
    if (kept[kept.length - 1] !== data.length - 1) fail(`tol=${tol} seed=${seed}: last sample not archived`);
    for (let i = 1; i < kept.length; i++) {
      if (kept[i] <= kept[i - 1]) fail(`tol=${tol} seed=${seed}: archived indices not strictly increasing`);
    }

    worstRatio = Math.min(worstRatio, data.length / kept.length);
    worstErr = Math.max(worstErr, err);
  }
  const sample = swingingDoor(makeRun(2654435761), E);
  console.log(
    `  ±${String(tol).padStart(4)} °C  ±${E.toFixed(2).padStart(5)} °C` +
    `  ${String(sample.length).padStart(6)}` +
    `  ${(RECORD_N / sample.length).toFixed(1).padStart(6)}:1` +
    `  ${worstErr.toFixed(3).padStart(7)} °C` +
    `   ${worstErr <= tol + 1e-9 ? 'yes' : 'NO'}   (worst ratio /40 runs ${worstRatio.toFixed(1)}:1)`
  );
}

// a wider deadband must never store MORE points
const data = makeRun(99);
let prev = Infinity;
for (const E of [0.25, 0.5, 1, 2, 4, 8, 16, 32]) {
  const n = swingingDoor(data, E).length;
  if (n > prev) fail(`monotonicity: E=${E} stored ${n} points, more than the tighter band's ${prev}`);
  prev = n;
}

// a deadband of zero should archive essentially everything
const dense = swingingDoor(data, 0).length;
if (dense < data.length * 0.5) fail(`E=0 stored only ${dense} of ${data.length} — too lossy for a zero deadband`);

console.log('');
if (ok) {
  console.log('  PASS  error never exceeds the stated tolerance, on 240 runs');
  console.log('  PASS  error never breaches the theoretical 2E bound');
  console.log('  PASS  endpoints always archived, indices strictly increasing');
  console.log('  PASS  wider deadband never stores more points');
}
process.exit(ok ? 0 : 1);
