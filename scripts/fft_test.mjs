// Verifies the order spectrum resolves what it claims to resolve.
//   node scripts/fft_test.mjs
// It re-uses the real code: signal.js is read from disk, the DOM-dependent
// export is sliced off, and the maths above it is evaluated as-is. If the
// detector or the FFT changes, this test sees the change.

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', 'js', 'signal.js'), 'utf8');

const cut = src.indexOf('export function initSignal');
const maths = src.slice(0, cut)
  .replace(/^import .*$/m, '')
  .replace(/\/\/ -+\n$/, '');

const tmp = join(here, '..', 'dist', '_fft_probe.mjs');
writeFileSync(tmp, maths + '\nexport { Detector, FFT_N, ORDER_1X, DEFECT_ORDER, SPEC_TAKE };\n');

const { Detector, FFT_N, ORDER_1X, DEFECT_ORDER, SPEC_TAKE } =
  await import('file://' + tmp.replace(/\\/g, '/'));
unlinkSync(tmp);

const orderOf = (k) => (k * ((2 * Math.PI) / FFT_N)) / ORDER_1X;

/** strongest bin above a given order */
function dominant(det, minOrder) {
  let bk = 0, bv = 0;
  for (let k = 1; k < FFT_N / 2; k++) {
    if (orderOf(k) > minOrder && det.spec[k] > bv) { bv = det.spec[k]; bk = k; }
  }
  return { order: orderOf(bk), amp: bv };
}

function run(sustainFault) {
  const det = new Detector();
  for (let i = 0; i < 1200; i++) {
    if (sustainFault) { det.fault = 1; det.faultAge = 2; }   // envelope pinned at 1
    det.step(3.6);
    if (i % 4 === 0) det.transform();
  }
  return det;
}

console.log(`transform: ${SPEC_TAKE}-pt Hann, zero-padded to ${FFT_N}`);
console.log(`bin spacing: ${orderOf(1).toFixed(3)} orders\n`);

const healthy = run(false);
const h1 = dominant(healthy, 0.2);
const hHi = dominant(healthy, 4);
console.log('HEALTHY');
console.log(`  strongest order       ${h1.order.toFixed(2)}X        expect 1.00X`);
console.log(`  strongest above 4X    ${hHi.order.toFixed(2)}X  amp ${hHi.amp.toFixed(4)}  (noise floor)`);

const faulted = run(true);
const fHi = dominant(faulted, 4);
const fHi2 = dominant(faulted, 10);
console.log('\nFAULTED (defect held at full envelope)');
console.log(`  strongest above 4X    ${fHi.order.toFixed(2)}X       expect ${DEFECT_ORDER.toFixed(2)}X`);
console.log(`  strongest above 10X   ${fHi2.order.toFixed(2)}X      expect ${(DEFECT_ORDER * 2).toFixed(2)}X`);
console.log(`  defect vs noise floor ${(fHi.amp / (hHi.amp + 1e-9)).toFixed(1)}x louder`);

const checks = [
  ['shaft fundamental lands at 1X', Math.abs(h1.order - 1.0) < 0.15],
  ['defect lands at its true order', Math.abs(fHi.order - DEFECT_ORDER) < 0.2],
  ['second harmonic lands at 2x defect', Math.abs(fHi2.order - DEFECT_ORDER * 2) < 0.35],
  ['defect stands clear of the floor', fHi.amp > hHi.amp * 8],
];

console.log('');
let ok = true;
for (const [what, pass] of checks) {
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${what}`);
  if (!pass) ok = false;
}
process.exit(ok ? 0 : 1);
