// ---------------------------------------------------------------------------
// archive.js — the swinging-door archiver.
//
// A test bed produces a sample a second, for hours. You cannot keep all of it,
// and you cannot keep every tenth one either — decimation throws away the
// transients that matter and keeps the flat runs that do not. What a process
// historian actually does is SWINGING-DOOR COMPRESSION: store a point only
// when the straight line from the last stored point can no longer represent
// everything since, within a stated deadband.
//
// The guarantee is the interesting part, and it is easy to state wrongly.
// The swinging door keeps every sample inside a corridor of half-width E
// measured from the PIVOT. But the line a trend client draws back joins
// archived data points, and each of those may itself sit E off that corridor,
// so the reconstruction is bounded by 2E — not E. This panel is therefore
// parameterised by the number an engineer actually specifies: the TOLERANCE
// he is willing to accept on the stored history. The corridor is set to half
// of it, and the MAX ERROR readout is measured, never asserted — it rebuilds
// the reconstruction and compares it against all 1800 originals.
//
// (The first version of this file claimed the bound was E. A test over 240
// runs printed 1.9E every time, which is how the claim got fixed.)
//
// Same idea, same maths as PI and IP.21. About forty lines.
// ---------------------------------------------------------------------------

import { $, $$, clamp, cssVar, observe, reduced } from './utils.js';

const RECORD_N = 1800;        // 30 minutes at one sample a second

// ---------------------------------------------------------------------------
// A plausible exhaust-gas temperature record: slow thermal ramps, plateaus
// where the operator holds a load point, a couple of step changes, and
// thermocouple noise. Slow, smooth signals are exactly what a historian is
// asked to store — and exactly where the swinging door pays.
// ---------------------------------------------------------------------------
function makeRun(seed = 1) {
  // small deterministic PRNG so a run can be reproduced from its seed
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };

  const out = new Float64Array(RECORD_N);
  let v = 180 + rnd() * 60;
  let target = v;
  let hold = 0;

  for (let i = 0; i < RECORD_N; i++) {
    if (hold <= 0) {
      // pick a new load point and how long to sit on it
      target = 150 + rnd() * 520;
      hold = 120 + Math.floor(rnd() * 320);
    }
    hold--;

    // first-order approach to the set point — a real thermal lag
    v += (target - v) * 0.006;

    out[i] =
      v +
      6 * Math.sin(i * 0.0042) +          // slow drift
      2.2 * Math.sin(i * 0.031 + 1.3) +   // ripple
      (rnd() - 0.5) * 2.4;                // thermocouple noise
  }
  return out;
}

// ---------------------------------------------------------------------------
// Swinging door. Returns the indices that would be archived.
//
// From the pivot (t0, v0), track the steepest upward and shallowest downward
// slope that still keep every sample so far inside the ±E corridor. The
// instant the upper door swings past the lower one, no single line can cover
// the span any more: archive the PREVIOUS sample and start a new corridor
// from it.
// ---------------------------------------------------------------------------
export function swingingDoor(data, E) {
  const kept = [0];
  let t0 = 0, v0 = data[0];
  let sUp = -Infinity, sLo = Infinity;

  for (let t = 1; t < data.length; t++) {
    const dt = t - t0;
    const up = (data[t] - v0 - E) / dt;
    const lo = (data[t] - v0 + E) / dt;

    if (up > sUp) sUp = up;
    if (lo < sLo) sLo = lo;

    if (sUp > sLo) {                 // the doors have crossed
      const prev = t - 1;
      kept.push(prev);
      t0 = prev; v0 = data[prev];
      sUp = -Infinity; sLo = Infinity;
      // re-open the corridor against the sample that closed it
      const d2 = t - t0;
      sUp = (data[t] - v0 - E) / d2;
      sLo = (data[t] - v0 + E) / d2;
    }
  }
  if (kept[kept.length - 1] !== data.length - 1) kept.push(data.length - 1);
  return kept;
}

/** Measured worst-case error of the reconstruction — the bound, verified. */
function maxError(data, kept) {
  let worst = 0;
  for (let k = 0; k < kept.length - 1; k++) {
    const a = kept[k], b = kept[k + 1];
    const va = data[a], vb = data[b];
    const span = b - a;
    for (let i = a + 1; i < b; i++) {
      const lin = va + ((vb - va) * (i - a)) / span;
      const err = Math.abs(data[i] - lin);
      if (err > worst) worst = err;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
export function initArchive() {
  const canvas = $('[data-archive]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const slider = $('[data-arc-band]');
  const regen  = $('[data-arc-regen]');
  const elIn   = $('[data-arc="in"]');
  const elKept = $('[data-arc="kept"]');
  const elRatio = $('[data-arc="ratio"]');
  const elErr  = $('[data-arc="err"]');
  const elBand = $('[data-arc="band"]');
  const elCorr = $('[data-arc="corridor"]');

  let seed = 7;
  let data = makeRun(seed);
  let kept = [];
  let tolerance = 6;       // what the engineer specifies
  let E = 3;               // corridor half-width = tolerance / 2
  let reveal = 1;          // 0..1 playhead for the intro sweep

  function recompute() {
    tolerance = Number(slider?.value ?? 60) / 10;   // slider is in tenths of a degree
    E = tolerance / 2;                              // corridor half-width
    kept = swingingDoor(data, E);
    const err = maxError(data, kept);
    const ratio = data.length / kept.length;

    if (elIn)    elIn.textContent = String(data.length);
    if (elKept)  elKept.textContent = String(kept.length);
    if (elRatio) elRatio.textContent = ratio.toFixed(1) + ':1';
    if (elBand)  elBand.textContent = '±' + tolerance.toFixed(1) + ' °C';
    if (elCorr)  elCorr.textContent = '±' + E.toFixed(2) + ' °C';
    if (elErr) {
      elErr.textContent = err.toFixed(2) + ' °C';
      // the whole point: the measured worst case never breaches the tolerance
      elErr.dataset.state = err <= tolerance + 1e-9 ? 'NOMINAL' : 'ALARM';
    }
  }

  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width === w * dpr && canvas.height === h * dpr) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw() {
    size();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const padL = 40, padR = 12, padT = 22, padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const rule  = cssVar('--rule');
    const faint = cssVar('--ink-faint');
    const ink   = cssVar('--ink-dim');
    const trace = cssVar('--trace');
    const acc   = cssVar('--sodium');
    const dark  = cssVar('--scheme') !== 'light';
    const mono  = cssVar('--font-mono') || '"IBM Plex Mono", monospace';

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    const margin = (hi - lo) * 0.12 + 6;
    lo -= margin; hi += margin;

    const xOf = (i) => padL + (i / (data.length - 1)) * plotW;
    const yOf = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

    ctx.clearRect(0, 0, w, h);

    // --- axes -------------------------------------------------------------
    ctx.font = `500 9px ${mono}`;
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) / 4) * i;
      const y = Math.round(yOf(v)) + 0.5;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = ink;
      ctx.fillText(Math.round(v).toString(), 6, y + 3);
    }
    for (let m = 0; m <= 30; m += 5) {
      const x = Math.round(xOf((m / 30) * (data.length - 1))) + 0.5;
      ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.globalAlpha = 1;
      if (m % 10 === 0) { ctx.fillStyle = ink; ctx.fillText(`${m}m`, x + 3, h - 8); }
    }

    // --- raw record: everything the sensor produced ------------------------
    ctx.strokeStyle = faint;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = xOf(i), y = yOf(data[i]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // --- the ±E corridor around the reconstruction -------------------------
    const vis = kept;
    if (vis.length > 1) {
      const band = new Path2D();
      vis.forEach((i, n) => {
        const x = xOf(i), y = yOf(data[i] + E);
        n ? band.lineTo(x, y) : band.moveTo(x, y);
      });
      for (let n = vis.length - 1; n >= 0; n--) {
        band.lineTo(xOf(vis[n]), yOf(data[vis[n]] - E));
      }
      band.closePath();
      ctx.fillStyle = acc;
      ctx.globalAlpha = 0.16;
      ctx.fill(band);
      ctx.strokeStyle = acc;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      ctx.stroke(band);
      ctx.globalAlpha = 1;

      // --- what a trend client would actually draw back -------------------
      const line = new Path2D();
      vis.forEach((i, n) => {
        const x = xOf(i), y = yOf(data[i]);
        n ? line.lineTo(x, y) : line.moveTo(x, y);
      });
      if (dark) {
        ctx.save();
        ctx.strokeStyle = trace;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.08; ctx.lineWidth = 7; ctx.stroke(line);
        ctx.globalAlpha = 0.16; ctx.lineWidth = 3.4; ctx.stroke(line);
        ctx.restore();
      }
      ctx.strokeStyle = trace;
      ctx.lineWidth = 1.5;
      ctx.stroke(line);

      // --- the stored points themselves ------------------------------------
      // hollow rings, so a dense archive still reads as discrete points
      // rather than merging into a second line
      const step = vis.length > 300 ? Math.ceil(vis.length / 300) : 1;
      const r = vis.length > 120 ? 1.6 : 2.6;
      ctx.strokeStyle = acc;
      ctx.fillStyle = cssVar('--void');
      ctx.lineWidth = 1.4;
      for (let n = 0; n < vis.length; n += step) {
        ctx.beginPath();
        ctx.arc(xOf(vis[n]), yOf(data[vis[n]]), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // --- playhead ----------------------------------------------------------
    // Purely a scan line: it rides across once on first view. The record is
    // already fully drawn behind it, so a stalled frame clock costs a flourish
    // and never the content.
    if (reveal < 1) {
      const x = xOf(Math.floor(reveal * (data.length - 1)));
      const g = ctx.createLinearGradient(x - 60, 0, x, 0);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, acc);
      ctx.strokeStyle = g;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 60, padT); ctx.lineTo(x - 60, padT + plotH); ctx.stroke();
      ctx.strokeStyle = acc;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = ink;
    ctx.font = `500 10px ${mono}`;
    ctx.fillText('TE-204  ·  exhaust gas temperature  ·  °C  ·  1 Hz', padL, 14);
  }

  // --- wiring ---------------------------------------------------------------
  slider?.addEventListener('input', () => { recompute(); draw(); });

  regen?.addEventListener('click', () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    data = makeRun(seed);
    recompute();
    draw();                       // the new record is on screen immediately
    if (!reduced()) { reveal = 0; sweep(); }
  });

  let sweepGuard = 0;

  function sweep() {
    let t0 = 0;
    const dur = 1500;
    const step = (now) => {
      if (!t0) t0 = now;                 // anchor to the rAF clock, not another one
      const p = clamp((now - t0) / dur);
      reveal = 1 - Math.pow(1 - p, 3);
      draw();
      if (p < 1) requestAnimationFrame(step);
      else { reveal = 1; draw(); }
    };
    requestAnimationFrame(step);

    // Insurance. The reveal is decoration; the chart is the content. If the
    // frame clock stalls for any reason, the record must still end up drawn.
    clearTimeout(sweepGuard);
    sweepGuard = setTimeout(() => {
      if (reveal < 1) { reveal = 1; draw(); }
    }, dur + 900);
  }

  recompute();
  reveal = 1;
  draw();

  window.addEventListener('resize', draw, { passive: true });

  // repaint on palette change — the canvas reads its colours from the tokens
  new MutationObserver(() => draw())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if (!reduced()) {
    observe([canvas], (el, inView) => {
      if (!inView || el.dataset.swept) return;
      el.dataset.swept = '1';
      reveal = 0;
      sweep();
    }, { threshold: 0.35 });
  }
}
