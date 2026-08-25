// ---------------------------------------------------------------------------
// bench.js — the backpressure bench.
//
// A discrete-event simulation of Inferno's admission control, operable:
// crank the REQ/S knob, watch queue depth climb, batches flush, and — past
// the HIGH watermark — the gateway shed load with 429 + Retry-After until
// depth falls back through LOW. The latch between the two watermarks is
// hysteresis, and feeling it stop the oscillation is the entire demo.
//
// The mechanics mirror the real system's bullets 1:1:
//   · dynamic batching, size-or-timeout window
//   · dual high/low watermarks with a shedding latch
//   · Poisson arrivals (real traffic is bursty; a metronome would flatter it)
// ---------------------------------------------------------------------------

import { $, clamp, cssVar, onTick, reduced } from './utils.js';

const COLS = 240;              // chart columns
const BATCH_SIZE = 8;       // flush at this many...
const BATCH_TICKS = 5;      // ...or after this many sim ticks
const SERVICE = 6;          // jobs one worker pool clears per tick
const HIGH = 60, LOW = 24;  // the watermarks

class Sim {
  constructor() {
    this.depth = 0;
    this.batch = 0;
    this.batchAge = 0;
    this.shedding = false;
    this.hist = [];          // {depth, shed, arrived, rejected, flushed}
    this.total = { accepted: 0, rejected: 0, flushed: 0 };
  }

  /** Poisson arrivals: k events this tick at rate λ (Knuth's method). */
  arrivals(lambda) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= Math.random(); } while (p > L);
    return k - 1;
  }

  step(rate) {
    const arrived = this.arrivals(rate);
    let rejected = 0;

    // ---- the latch: this IS the feature -----------------------------------
    if (this.depth >= HIGH) this.shedding = true;
    else if (this.depth <= LOW) this.shedding = false;

    if (this.shedding) {
      rejected = arrived;                    // 429 + Retry-After
      this.total.rejected += rejected;
    } else {
      this.batch += arrived;
      this.total.accepted += arrived;
    }

    // ---- size-or-timeout batch window -------------------------------------
    this.batchAge++;
    let flushed = 0;
    if (this.batch >= BATCH_SIZE || (this.batchAge >= BATCH_TICKS && this.batch > 0)) {
      flushed = this.batch;
      this.depth += this.batch;
      this.total.flushed += 1;
      this.batch = 0;
      this.batchAge = 0;
    }

    // ---- workers drain the queue ------------------------------------------
    this.depth = Math.max(0, this.depth - SERVICE);

    this.hist.push({ depth: this.depth, shed: this.shedding, rejected, flushed });
    if (this.hist.length > COLS) this.hist.shift();
  }
}

// ---------------------------------------------------------------------------
export function initBench() {
  const canvas = $('[data-bench]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const sim = new Sim();

  const knob    = $('[data-bench-knob]');
  const knobArm = $('[data-bench-arm]');
  const elRate  = $('[data-bench="rate"]');
  const elDepth = $('[data-bench="depth"]');
  const elState = $('[data-bench="state"]');
  const elRej   = $('[data-bench="rej"]');

  // ---- the knob: pointer-capture rotary ------------------------------------
  // Angle from the knob centre via atan2; sweep -135°..+135° maps to rate.
  let rate = 3.4;                 // req/tick — starts below saturation
  const MIN = 0.4, MAX = 14;

  function paintKnob() {
    const t = (rate - MIN) / (MAX - MIN);
    const deg = -135 + t * 270;
    if (knobArm) knobArm.style.transform = `rotate(${deg}deg)`;
    if (elRate) elRate.textContent = (rate * 34).toFixed(0);   // ticks→req/s at 34Hz
    knob?.setAttribute('aria-valuenow', (rate * 34).toFixed(0));
  }

  if (knob) {
    knob.setAttribute('role', 'slider');
    knob.setAttribute('aria-label', 'Request rate');
    knob.setAttribute('aria-valuemin', String(Math.round(MIN * 34)));
    knob.setAttribute('aria-valuemax', String(Math.round(MAX * 34)));
    knob.tabIndex = 0;

    knob.addEventListener('pointerdown', (e) => {
      knob.setPointerCapture(e.pointerId);
      knob.classList.add('is-held');
    });
    knob.addEventListener('pointermove', (e) => {
      if (!knob.hasPointerCapture?.(e.pointerId)) return;
      const r = knob.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      let deg = Math.atan2(dx, -dy) * 180 / Math.PI;   // 0 at 12 o'clock
      deg = clamp(deg, -135, 135);
      rate = MIN + ((deg + 135) / 270) * (MAX - MIN);
      paintKnob();
    });
    const release = (e) => {
      try { knob.releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
      knob.classList.remove('is-held');
    };
    knob.addEventListener('pointerup', release);
    knob.addEventListener('pointercancel', release);
    knob.addEventListener('keydown', (e) => {
      const step = (MAX - MIN) / 20;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { rate = clamp(rate + step, MIN, MAX); paintKnob(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { rate = clamp(rate - step, MIN, MAX); paintKnob(); e.preventDefault(); }
    });
  }
  paintKnob();

  // ---- drawing -------------------------------------------------------------
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  /**
   * Phosphor bloom: the same path stroked wide-and-faint before it is stroked
   * crisp. A real scope's trace glows because the phosphor keeps emitting
   * after the beam has passed; on a light ground it would just look muddy,
   * so it is dark-theme only.
   */
  function glowStroke(path, colour, dark) {
    if (dark) {
      ctx.save();
      ctx.strokeStyle = colour;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.08; ctx.lineWidth = 7; ctx.stroke(path);
      ctx.globalAlpha = 0.16; ctx.lineWidth = 3.4; ctx.stroke(path);
      ctx.restore();
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.stroke(path);
  }

  function draw() {
    size();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const pad = 12;
    const lane = h - 46;                       // reject ticks live below this
    const innerH = lane - pad;

    const rule  = cssVar('--rule');
    const trace = cssVar('--trace');
    const acc   = cssVar('--sodium');
    const alarm = cssVar('--alarm');
    const faint = cssVar('--ink-faint');
    const dark  = cssVar('--scheme') !== 'light';
    const mono  = cssVar('--font-mono') || '"IBM Plex Mono", monospace';

    ctx.clearRect(0, 0, w, h);

    const maxDepth = 100;
    const yOf = (d) => pad + innerH - (clamp(d, 0, maxDepth) / maxDepth) * innerH;
    const xOf = (i) => (i / (COLS - 1)) * w;

    // grid + watermarks
    ctx.strokeStyle = rule;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = Math.round(pad + (innerH / 4) * i) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    [[HIGH, 'HIGH'], [LOW, 'LOW']].forEach(([v, label]) => {
      const y = Math.round(yOf(v)) + 0.5;
      ctx.strokeStyle = acc;
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = acc;
      ctx.font = `500 9px ${mono}`;
      ctx.fillText(`${label} ${v}`, w - 58, y - 4);
    });

    const hist = sim.hist;
    if (hist.length < 2) return;

    // shedding spans
    hist.forEach((s, i) => {
      if (!s.shed) return;
      ctx.fillStyle = alarm;
      ctx.globalAlpha = 0.10;
      ctx.fillRect(xOf(i), pad, w / COLS + 1, innerH);
    });
    ctx.globalAlpha = 1;

    // depth trace, filled
    const line = new Path2D();
    const area = new Path2D();
    hist.forEach((s, i) => {
      const x = xOf(i), y = yOf(s.depth);
      if (i) { line.lineTo(x, y); area.lineTo(x, y); }
      else   { line.moveTo(x, y); area.moveTo(x, y); }
    });
    area.lineTo(xOf(hist.length - 1), yOf(0));
    area.lineTo(xOf(0), yOf(0));
    area.closePath();
    ctx.fillStyle = trace;
    ctx.globalAlpha = 0.08;
    ctx.fill(area);
    ctx.globalAlpha = 1;
    glowStroke(line, trace, dark);

    // batch flushes: sodium ticks on the trace
    hist.forEach((s, i) => {
      if (!s.flushed) return;
      ctx.fillStyle = acc;
      ctx.fillRect(xOf(i) - 1, yOf(s.depth) - 3, 2, 6);
    });

    // 429 lane — divided from the scope so a zero-depth baseline never
    // reads as a row of rejections
    ctx.strokeStyle = rule;
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(0, lane + 6.5); ctx.lineTo(w, lane + 6.5); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = faint;
    ctx.font = `500 9px ${mono}`;
    ctx.fillText('429 / RETRY-AFTER', 10, lane + 20);
    hist.forEach((s, i) => {
      if (!s.rejected) return;
      ctx.fillStyle = alarm;
      ctx.fillRect(xOf(i), lane + 26, Math.max(1.5, w / COLS - 1), Math.min(12, 2 + s.rejected * 1.4));
    });
  }

  function readouts() {
    if (elDepth) elDepth.textContent = String(sim.depth);
    if (elRej)   elRej.textContent = String(sim.total.rejected);
    if (elState) {
      elState.textContent = sim.shedding ? 'SHEDDING' : 'ADMITTING';
      elState.dataset.state = sim.shedding ? 'ALARM' : 'NOMINAL';
    }
  }

  // ---- run -----------------------------------------------------------------
  if (reduced()) {
    // one representative window: ramp in, saturate, latch, recover — static
    for (let i = 0; i < COLS; i++) sim.step(i < 80 ? 3 : i < 150 ? 11 : 3);
    draw(); readouts();
    window.addEventListener('resize', draw, { passive: true });
    return;
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 })
    .observe(canvas);

  let last = 0;
  onTick((now) => {
    if (!visible || document.hidden) return;
    if (now - last < 1000 / 34) return;
    last = now;
    sim.step(rate);
    draw();
    readouts();
  });
}
