// ---------------------------------------------------------------------------
// signal.js — live anomaly detector, in two domains.
//
// TIME     a trailing-window z-score with EWMA smoothing and a hysteresis
//          latch: the same detector shape that runs on the test bed.
// SPECTRUM a real radix-2 FFT of the same buffer, plotted in ORDERS (multiples
//          of shaft speed) — which is how rotating machinery is actually
//          diagnosed. Inject the fault and the time trace barely twitches
//          while a peak stands straight up at 7.2X. That contrast is the
//          entire argument for order analysis, and you can see it here in
//          one click.
//
// The signal is synthetic and labelled as such; the maths is not.
// ---------------------------------------------------------------------------

import { $, $$, clamp, cssVar, onTick, reduced } from './utils.js';

const N = 280;        // samples on screen
const W = 110;        // trailing window for the statistics
const EPS = 1e-6;

// --- machine model ----------------------------------------------------------
// One shaft order = ORDER_1X radians per sample. Every component is defined as
// a multiple of it, so the spectrum's x-axis is honest: 1X really is 1X.
const ORDER_1X = 0.085;
const DEFECT_ORDER = 7.2;    // a plausible outer-race ball-pass frequency

// 256 real samples, zero-padded to 512 before the transform. Padding does not
// add true resolution — the main lobe stays as wide as 256 samples allows —
// but it interpolates between bins, so a peak reads at its real order instead
// of snapping to the nearest of 128 slots. Standard practice, stated plainly.
const SPEC_TAKE = 256;
const FFT_N = 512;

// ---------------------------------------------------------------------------
// FFT — iterative in-place radix-2 Cooley-Tukey. ~40 lines, no dependency.
// ---------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i++) {          // bit-reversal permutation
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + half], xi = im[i + k + half];
        const vr = xr * cr - xi * ci;
        const vi = xr * ci + xi * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Hann window — without it the peaks smear across neighbouring bins. */
const hann = (i, n) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));

// ---------------------------------------------------------------------------
class Detector {
  constructor() { this.reset(); }

  reset() {
    this.buf = [];
    this.flags = [];
    this.zs = 0;
    this.t = 0;
    this.fault = 0;
    this.faultAge = 0;
    this.state = 'NOMINAL';
    this.mean = 0;
    this.sd = 0;
    this.spec = new Float32Array(FFT_N / 2);
    this.specPeak = 1;
  }

  /** Healthy machine: shaft fundamental, its second harmonic, a half-order
   *  component, and sensor noise. */
  sample() {
    const t = this.t++;
    let v =
      0.62 * Math.sin(t * ORDER_1X) +
      0.30 * Math.sin(t * ORDER_1X * 2 + 1.1) +
      0.10 * Math.sin(t * ORDER_1X * 0.5 + 0.4) +
      (Math.random() - 0.5) * 0.20;

    if (this.fault > 0) {
      // Bearing-defect signature: an impulsive ring at the defect order plus
      // its second harmonic, growing then decaying. In the time domain it
      // hides inside the envelope for the first ~20 samples. In the spectrum
      // it is unmissable from the first one.
      const age = this.faultAge - this.fault;
      const env = Math.sin((age / this.faultAge) * Math.PI) ** 1.4;
      v += env * (
        0.55 * Math.sin(t * ORDER_1X * DEFECT_ORDER) +
        0.25 * Math.sin(t * ORDER_1X * DEFECT_ORDER * 2)
      );
      this.fault--;
    }
    return v;
  }

  step(threshold) {
    const v = this.sample();
    this.buf.push(v);
    if (this.buf.length > N) { this.buf.shift(); this.flags.shift(); }

    const hist = this.buf.slice(Math.max(0, this.buf.length - 1 - W), this.buf.length - 1);
    if (hist.length > 12) {
      const m = hist.reduce((a, b) => a + b, 0) / hist.length;
      const varr = hist.reduce((a, b) => a + (b - m) * (b - m), 0) / hist.length;
      this.mean = m;
      this.sd = Math.sqrt(varr);
    }

    const z = Math.abs(v - this.mean) / (this.sd + EPS);
    this.zs = this.zs * 0.72 + z * 0.28;          // EWMA kills single-sample spikes

    // hysteresis: enter ALARM at the threshold, leave only below 70% of it
    const warn = threshold * 0.66;
    if (this.zs >= threshold) this.state = 'ALARM';
    else if (this.state === 'ALARM' && this.zs > threshold * 0.7) this.state = 'ALARM';
    else if (this.zs >= warn) this.state = 'WARNING';
    else this.state = 'NOMINAL';

    this.flags.push(this.state);
    return v;
  }

  /** Windowed, zero-padded magnitude spectrum of the newest SPEC_TAKE samples. */
  transform() {
    if (this.buf.length < SPEC_TAKE) return;
    const re = new Float64Array(FFT_N);          // tail stays zero — the pad
    const im = new Float64Array(FFT_N);
    const start = this.buf.length - SPEC_TAKE;

    // remove the mean first, or the window leaks a large DC term across the
    // low orders and buries the 0.5X component
    let dc = 0;
    for (let i = 0; i < SPEC_TAKE; i++) dc += this.buf[start + i];
    dc /= SPEC_TAKE;
    for (let i = 0; i < SPEC_TAKE; i++) {
      re[i] = (this.buf[start + i] - dc) * hann(i, SPEC_TAKE);
    }

    fft(re, im);

    let peak = EPS;
    for (let k = 0; k < FFT_N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) / (SPEC_TAKE / 4);
      // light temporal smoothing so the display does not strobe
      this.spec[k] = this.spec[k] * 0.6 + mag * 0.4;
      if (this.spec[k] > peak) peak = this.spec[k];
    }
    this.specPeak = this.specPeak * 0.9 + peak * 0.1;
  }

  inject(len = 90) { this.fault = len; this.faultAge = len; }
}

// ---------------------------------------------------------------------------
export function initSignal() {
  const canvas = $('[data-signal]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const det = new Detector();

  const elZ     = $('[data-sig="z"]');
  const elSd    = $('[data-sig="sd"]');
  const elState = $('[data-sig="state"]');
  const elThr   = $('[data-sig="thr"]');
  const slider  = $('[data-sig-sens]');
  const btn     = $('[data-sig-inject]');

  let threshold = 3.6;
  let mode = 'time';

  const readSlider = () => {
    const s = Number(slider?.value ?? 6);
    threshold = 6.6 - s * 0.46;
    if (elThr) elThr.textContent = threshold.toFixed(2) + ' σ';
  };
  slider?.addEventListener('input', readSlider);
  readSlider();

  // --- domain toggle --------------------------------------------------------
  $$('[data-sig-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.sigMode;
      $$('[data-sig-mode]').forEach((o) => {
        const on = o === b;
        o.classList.toggle('is-on', on);
        o.setAttribute('aria-pressed', String(on));
      });
      if (still) { draw(); }
    });
  });

  btn?.addEventListener('click', () => {
    det.inject(90);
    btn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.95)' }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'cubic-bezier(0.16,1,0.30,1)' }
    );
    if (still) { prime(true); draw(); readouts(); }
  });

  function sizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width === w * dpr && canvas.height === h * dpr) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const palette = () => ({
    ink:   cssVar('--ink-faint'),
    rule:  cssVar('--rule'),
    trace: cssVar('--trace'),
    alarm: cssVar('--alarm'),
    warn:  cssVar('--warning'),
    acc:   cssVar('--sodium'),
    dark:  cssVar('--scheme') !== 'light',
    mono:  cssVar('--font-mono') || '"IBM Plex Mono", monospace',
  });

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

  // --- TIME -----------------------------------------------------------------
  function drawTime(w, h, p) {
    const pad = 14;
    const innerH = h - pad * 2;
    const buf = det.buf;
    if (buf.length < 2) return;

    const scale = 2.6;
    const yOf = (v) => pad + innerH / 2 - (v / scale) * (innerH / 2);
    const xOf = (i) => (i / (N - 1)) * w;

    // tolerance band: mean ± threshold·σ
    const top = yOf(det.mean + threshold * det.sd);
    const bot = yOf(det.mean - threshold * det.sd);
    ctx.fillStyle = p.acc;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(0, top, w, bot - top);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = p.acc;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, top); ctx.lineTo(w, top);
    ctx.moveTo(0, bot); ctx.lineTo(w, bot);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // flagged spans
    for (let i = 1; i < buf.length; i++) {
      const s = det.flags[i];
      if (s === 'NOMINAL') continue;
      ctx.fillStyle = s === 'ALARM' ? p.alarm : p.warn;
      ctx.globalAlpha = s === 'ALARM' ? 0.16 : 0.09;
      ctx.fillRect(xOf(i - 1), pad, Math.ceil(w / N) + 1, innerH);
    }
    ctx.globalAlpha = 1;

    const line = new Path2D();
    buf.forEach((v, i) => {
      const x = xOf(i), y = yOf(v);
      i ? line.lineTo(x, y) : line.moveTo(x, y);
    });
    glowStroke(line, p.trace, p.dark);

    // recolour only the alarming segments
    const hot = new Path2D();
    let open = false;
    buf.forEach((v, i) => {
      if (det.flags[i] === 'ALARM') {
        const x = xOf(i), y = yOf(v);
        open ? hot.lineTo(x, y) : hot.moveTo(x, y);
        open = true;
      } else open = false;
    });
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = p.alarm;
    ctx.stroke(hot);

    // live head
    const last = buf[buf.length - 1];
    const hx = xOf(buf.length - 1), hy = yOf(last);
    ctx.fillStyle = det.state === 'ALARM' ? p.alarm : p.trace;
    ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(hx, hy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.ink;
    ctx.font = `500 10px ${p.mono}`;
    ctx.fillText('VIB-01  ·  mm/s RMS  ·  time domain', 10, pad + 12);
  }

  // --- SPECTRUM -------------------------------------------------------------
  function drawSpectrum(w, h, p) {
    const padL = 34, padR = 10, padT = 42, padB = 26;   // room for the dB axis
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;

    const bins = FFT_N / 2;
    // bin k sits at k·(2π/FFT_N) rad/sample; divide by one shaft order
    const orderOf = (k) => (k * (2 * Math.PI / FFT_N)) / ORDER_1X;
    const maxOrder = orderOf(bins - 1);
    const xOf = (o) => padL + (o / maxOrder) * plotW;

    // Decibels, not linear amplitude. A vibration spectrum is always read on a
    // log scale: a defect that matters is often 20 dB down on the shaft peak,
    // and on a linear axis it is a bump you would miss. 48 dB of range below
    // the current peak is the usual window.
    const dbOf = (m) => 20 * Math.log10(m + 1e-6);
    const dbTop = dbOf(det.specPeak) + 3;
    const dbFloor = dbTop - 48;
    const yOf = (m) => padT + plotH -
      clamp((dbOf(m) - dbFloor) / (dbTop - dbFloor), 0, 1) * plotH;

    // the defect band is labelled whether or not a fault is present — an
    // analyst knows where to look before anything happens
    [[DEFECT_ORDER, '7.2X DEFECT'], [DEFECT_ORDER * 2, '14.4X']].forEach(([o, label]) => {
      const x0 = xOf(o * 0.94), x1 = xOf(o * 1.06);
      ctx.fillStyle = p.acc;
      ctx.globalAlpha = 0.10;
      ctx.fillRect(x0, padT, x1 - x0, plotH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.acc;
      ctx.font = `500 9px ${p.mono}`;
      ctx.fillText(label, x0, padT - 8);
    });

    // shaft orders
    ctx.strokeStyle = p.rule;
    ctx.fillStyle = p.ink;
    ctx.font = `500 9px ${p.mono}`;
    // gridlines on every order of interest, but labels only where they fit —
    // 0.5X, 1X and 2X sit within 20px of each other at this scale
    [[0.5, ''], [1, '1X'], [2, ''], [5, '5X'], [10, '10X'], [20, '20X'], [30, '30X']]
      .forEach(([o, label]) => {
        const x = Math.round(xOf(o)) + 0.5;
        ctx.globalAlpha = label ? 0.45 : 0.25;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + plotH); ctx.stroke();
        ctx.globalAlpha = 1;
        if (label) ctx.fillText(label, x + 3, h - 8);
      });
    ctx.fillStyle = p.ink;
    ctx.fillText('ORDERS (× shaft)', padL, h - 8);

    // dB grid, labelled relative to the current peak
    ctx.font = `500 9px ${p.mono}`;
    for (let d = 0; d >= -48; d -= 12) {
      const y = Math.round(yOf(det.specPeak * Math.pow(10, d / 20))) + 0.5;
      ctx.strokeStyle = p.rule;
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.ink;
      ctx.fillText(d === 0 ? '0' : String(d), 4, y + 3);
    }

    // the spectrum itself
    const area = new Path2D();
    const line = new Path2D();
    area.moveTo(xOf(orderOf(1)), padT + plotH);
    for (let k = 1; k < bins; k++) {
      const x = xOf(orderOf(k)), y = yOf(det.spec[k]);
      k === 1 ? line.moveTo(x, y) : line.lineTo(x, y);
      area.lineTo(x, y);
    }
    area.lineTo(xOf(maxOrder), padT + plotH);
    area.closePath();
    ctx.fillStyle = p.trace;
    ctx.globalAlpha = 0.10;
    ctx.fill(area);
    ctx.globalAlpha = 1;
    glowStroke(line, p.trace, p.dark);

    // mark the tallest bin above 5X — the thing an analyst reads first
    let peakK = 0, peakV = 0;
    for (let k = 1; k < bins; k++) {
      if (orderOf(k) > 4 && det.spec[k] > peakV) { peakV = det.spec[k]; peakK = k; }
    }
    if (peakK && peakV > det.specPeak * 0.35) {
      const x = xOf(orderOf(peakK)), y = yOf(peakV);
      ctx.strokeStyle = p.alarm;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = p.alarm;
      ctx.font = `600 9px ${p.mono}`;
      ctx.fillText(`${orderOf(peakK).toFixed(1)}X`, x + 8, y + 3);
    }

    ctx.fillStyle = p.ink;
    ctx.font = `500 10px ${p.mono}`;
    ctx.fillText(`VIB-01  ·  order spectrum  ·  dB rel. peak  ·  ${SPEC_TAKE}-pt Hann → ${FFT_N}`, padL, 14);
  }

  // --- frame ----------------------------------------------------------------
  function draw() {
    sizeCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const p = palette();

    ctx.clearRect(0, 0, w, h);

    if (mode === 'time') {
      const pad = 14, innerH = h - pad * 2;
      ctx.strokeStyle = p.rule;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) {
        const y = Math.round(pad + (innerH / 4) * i) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      for (let i = 0; i <= 10; i++) {
        const x = Math.round((w / 10) * i) + 0.5;
        ctx.moveTo(x, pad); ctx.lineTo(x, h - pad);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      drawTime(w, h, p);
    } else {
      drawSpectrum(w, h, p);
    }
  }

  function readouts() {
    if (elZ)  elZ.textContent  = det.zs.toFixed(2);
    if (elSd) elSd.textContent = det.sd.toFixed(3);
    if (elState) {
      elState.textContent = det.state;
      elState.dataset.state = det.state;
    }
  }

  function prime(withFault = false) {
    det.reset();
    for (let i = 0; i < N; i++) {
      if (withFault && i === N - 120) det.inject(90);
      det.step(threshold);
    }
    det.transform();
  }

  const still = reduced();

  if (still) {
    prime(true);
    draw();
    readouts();
    window.addEventListener('resize', draw, { passive: true });
    return;
  }

  prime(false);

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 })
    .observe(canvas);

  let last = 0;
  let frame = 0;
  onTick((now) => {
    if (!visible || document.hidden) return;
    if (now - last < 1000 / 34) return;    // 34 Hz sample rate on screen
    last = now;
    det.step(threshold);
    // the FFT is the expensive part — every third frame is plenty for the eye
    if (mode === 'spectrum' && frame++ % 3 === 0) det.transform();
    draw();
    readouts();
  });
}
