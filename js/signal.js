// ---------------------------------------------------------------------------
// signal.js — live anomaly detector.
//
// This is not a decorative animation. It runs the same shape of detector that
// sits on the engine test bed: a trailing window, a running mean and standard
// deviation, an EWMA-smoothed z-score, and a threshold with hysteresis.
// Inject a fault and watch it cross the band before the amplitude looks wrong
// to a human — that is the entire argument for predictive maintenance.
// ---------------------------------------------------------------------------

import { $, clamp, cssVar, onTick, reduced } from './utils.js';

const N = 280;        // samples on screen
const W = 110;        // trailing window for the statistics
const EPS = 1e-6;

class Detector {
  constructor() { this.reset(); }

  reset() {
    this.buf = [];
    this.flags = [];
    this.zs = 0;
    this.t = 0;
    this.fault = 0;        // remaining fault samples
    this.faultAge = 0;
    this.state = 'NOMINAL';
    this.mean = 0;
    this.sd = 0;
    this.peak = 0;
  }

  /** Healthy machine: two shaft harmonics plus sensor noise. */
  sample() {
    const t = this.t++;
    let v =
      0.62 * Math.sin(t * 0.085) +
      0.30 * Math.sin(t * 0.213 + 1.1) +
      0.10 * Math.sin(t * 0.031 + 0.4) +
      (Math.random() - 0.5) * 0.20;

    if (this.fault > 0) {
      // bearing-defect signature: an impulsive high-frequency ring that
      // grows, then decays. Amplitude alone stays inside the visual envelope
      // for the first ~20 samples — the detector sees it long before you do.
      const age = this.faultAge - this.fault;
      const env = Math.sin((age / this.faultAge) * Math.PI) ** 1.4;
      v += env * (0.55 * Math.sin(t * 1.31) + 0.25 * Math.sin(t * 2.07));
      this.fault--;
    }
    return v;
  }

  step(threshold) {
    const v = this.sample();
    this.buf.push(v);
    if (this.buf.length > N) { this.buf.shift(); this.flags.shift(); }

    // trailing window statistics, excluding the newest sample
    const hist = this.buf.slice(Math.max(0, this.buf.length - 1 - W), this.buf.length - 1);
    if (hist.length > 12) {
      const m = hist.reduce((a, b) => a + b, 0) / hist.length;
      const varr = hist.reduce((a, b) => a + (b - m) * (b - m), 0) / hist.length;
      this.mean = m;
      this.sd = Math.sqrt(varr);
    }

    const z = Math.abs(v - this.mean) / (this.sd + EPS);
    this.zs = this.zs * 0.72 + z * 0.28;          // EWMA — kills single-sample spikes
    this.peak = Math.max(this.peak * 0.995, this.zs);

    // hysteresis: enter ALARM at the threshold, leave only below 70% of it
    const warn = threshold * 0.66;
    if (this.zs >= threshold) this.state = 'ALARM';
    else if (this.state === 'ALARM' && this.zs > threshold * 0.7) this.state = 'ALARM';
    else if (this.zs >= warn) this.state = 'WARNING';
    else this.state = 'NOMINAL';

    this.flags.push(this.state);
    return v;
  }

  inject(len = 90) { this.fault = len; this.faultAge = len; }
}

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

  const readSlider = () => {
    const s = Number(slider?.value ?? 6);
    threshold = 6.6 - s * 0.46;          // 10 -> 2.0 (jumpy) … 1 -> 6.1 (deaf)
    if (elThr) elThr.textContent = threshold.toFixed(2) + ' σ';
  };
  slider?.addEventListener('input', readSlider);
  readSlider();

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

  function draw() {
    sizeCanvas();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pad = 14;
    const innerH = h - pad * 2;

    const ink   = cssVar('--ink-faint');
    const rule  = cssVar('--rule');
    const trace = cssVar('--trace');
    const alarm = cssVar('--alarm');
    const warn  = cssVar('--warning');
    const acc   = cssVar('--sodium');

    ctx.clearRect(0, 0, w, h);

    // --- grid -------------------------------------------------------------
    ctx.strokeStyle = rule;
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

    const buf = det.buf;
    if (buf.length < 2) return;

    const scale = 2.6;
    const yOf = (v) => pad + innerH / 2 - (v / scale) * (innerH / 2);
    const xOf = (i) => (i / (N - 1)) * w;

    // --- tolerance band: mean ± threshold·σ -------------------------------
    const top = yOf(det.mean + threshold * det.sd);
    const bot = yOf(det.mean - threshold * det.sd);
    ctx.fillStyle = acc;
    ctx.globalAlpha = 0.07;
    ctx.fillRect(0, top, w, bot - top);
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = acc;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(0, top); ctx.lineTo(w, top);
    ctx.moveTo(0, bot); ctx.lineTo(w, bot);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // --- flagged spans ----------------------------------------------------
    for (let i = 1; i < buf.length; i++) {
      const s = det.flags[i];
      if (s === 'NOMINAL') continue;
      ctx.fillStyle = s === 'ALARM' ? alarm : warn;
      ctx.globalAlpha = s === 'ALARM' ? 0.16 : 0.09;
      ctx.fillRect(xOf(i - 1), pad, Math.ceil(w / N) + 1, innerH);
    }
    ctx.globalAlpha = 1;

    // --- trace ------------------------------------------------------------
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = trace;
    ctx.beginPath();
    buf.forEach((v, i) => {
      const x = xOf(i), y = yOf(v);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();

    // recolour only the alarming segments — the trace tells the story alone
    ctx.strokeStyle = alarm;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let open = false;
    buf.forEach((v, i) => {
      if (det.flags[i] === 'ALARM') {
        const x = xOf(i), y = yOf(v);
        open ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        open = true;
      } else open = false;
    });
    ctx.stroke();

    // --- live head --------------------------------------------------------
    const last = buf[buf.length - 1];
    const hx = xOf(buf.length - 1), hy = yOf(last);
    ctx.fillStyle = det.state === 'ALARM' ? alarm : trace;
    ctx.beginPath();
    ctx.arc(hx, hy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(hx, hy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // --- axis label -------------------------------------------------------
    ctx.fillStyle = ink;
    ctx.font = '500 10px "IBM Plex Mono", monospace';
    ctx.fillText('VIB-01  ·  mm/s RMS', 10, pad + 12);
  }

  function readouts() {
    if (elZ)  elZ.textContent  = det.zs.toFixed(2);
    if (elSd) elSd.textContent = det.sd.toFixed(3);
    if (elState) {
      elState.textContent = det.state;
      elState.dataset.state = det.state;
    }
  }

  // fill the buffer so the detector opens with real statistics, not a flat line
  function prime(withFault = false) {
    det.reset();
    for (let i = 0; i < N; i++) {
      if (withFault && i === N - 150) det.inject(90);
      det.step(threshold);
    }
  }

  const still = reduced();

  if (still) {
    // Reduced motion: render one complete window containing a fault, static.
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
  onTick((now) => {
    if (!visible || document.hidden) return;
    if (now - last < 1000 / 34) return;    // 34 Hz sample rate on screen
    last = now;
    det.step(threshold);
    draw();
    readouts();
  });
}
