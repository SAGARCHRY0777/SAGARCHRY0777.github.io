// ---------------------------------------------------------------------------
// effects.js — the second layer of motion.
//
// Four independent effects, each opt-in via a data attribute so nothing here
// is global and every one of them can be deleted without touching the rest:
//
//   [data-fit]        scale a display line to exactly fill its container
//   [data-scramble]   decode text from noise when it enters the viewport
//   [data-tilt]       pointer-tracked 3D tilt with a specular sheen
//   [data-roll]       digits roll up into place instead of appearing
// ---------------------------------------------------------------------------

import { $$, clamp, lerp, observe, onTick, reduced, isTouch } from './utils.js';

// ---------------------------------------------------------------------------
// 1. FIT — the reason "CHAUDHARY" no longer runs off the right edge.
//    Measures the rendered line and solves for the font size that fills the
//    container exactly, so the name is always edge-to-edge and never clipped.
// ---------------------------------------------------------------------------
export function initFit() {
  const lines = $$('[data-fit]');
  if (!lines.length) return;

  const fit = () => {
    lines.forEach((el) => {
      const box = el.parentElement;
      if (!box) return;
      // Measure against the viewport, never against a box the name's own
      // overflow may have widened — otherwise a wider font swapping in
      // re-fits to the overflow and the page locks wider than the screen.
      const left = box.getBoundingClientRect().left;
      const available = document.documentElement.clientWidth - left - left;
      const target = Math.min(box.clientWidth, Math.max(120, available));
      if (!target) return;

      // Measure at a known size, then scale linearly — one reflow, not a
      // binary search. The element is width:max-content in CSS, so offsetWidth
      // is the intrinsic width of the text rather than the container's.
      el.style.fontSize = '100px';
      el.style.whiteSpace = 'nowrap';
      const natural = el.offsetWidth;
      if (!natural) return;

      const max = Number(el.dataset.fitMax || 210);
      const min = Number(el.dataset.fitMin || 34);
      const size = clamp((target / natural) * 100, min, max);
      el.style.fontSize = `${size.toFixed(2)}px`;
    });
  };

  // Fonts change the metrics. `fonts.ready` can resolve BEFORE the display
  // face is even requested (it loads lazily on first use), so also listen
  // for every load-complete event and take two timed passes as a backstop.
  fit();
  document.fonts?.ready.then(fit);
  document.fonts?.addEventListener?.('loadingdone', fit);
  // ask for the display face explicitly — resolves when it is usable
  document.fonts?.load?.('800 100px "Archivo"').then(fit).catch(() => {});
  setTimeout(fit, 600);
  setTimeout(fit, 1800);

  // The decisive trigger: when the face swaps in, the line's own width
  // changes, and that is observable regardless of how the font arrived.
  if ('ResizeObserver' in window) {
    let busy = false;
    const ro = new ResizeObserver(() => {
      if (busy) return;
      busy = true;
      requestAnimationFrame(() => { fit(); busy = false; });
    });
    lines.forEach((el) => ro.observe(el));
  }

  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(fit, 120);
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// 2. SCRAMBLE — text resolves out of noise. Used on section headings, where
//    it reads as a readout locking on rather than as an effect for its own sake.
// ---------------------------------------------------------------------------
const GLYPHS = '▚▞░▒▓█/\\|<>=+*#@$%&0123456789';

function scrambleTo(el, text, duration = 900) {
  const chars = [...text];
  const start = performance.now();
  const settleAt = chars.map((_, i) => 0.28 + (i / chars.length) * 0.62);

  const step = (now) => {
    const p = clamp((now - start) / duration);
    el.textContent = chars.map((c, i) => {
      if (c === ' ') return ' ';
      if (p >= settleAt[i]) return c;
      return GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }).join('');
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = text;
  };
  requestAnimationFrame(step);
}

export function initScramble() {
  const els = $$('[data-scramble]');
  if (!els.length) return;

  if (reduced()) return;

  els.forEach((el) => { el.dataset.text = el.textContent.trim(); });

  observe(els, (el, inView) => {
    if (!inView || el.dataset.done === '1') return;
    el.dataset.done = '1';
    scrambleTo(el, el.dataset.text, Number(el.dataset.scramble) || 900);
  }, { threshold: 0.4, rootMargin: '0px' });

  // nav links re-scramble on hover — cheap, and it makes the chrome feel live
  $$('.nav__link, .chipbtn').forEach((el) => {
    const original = el.textContent;
    el.addEventListener('pointerenter', () => {
      if (el.dataset.busy === '1') return;
      el.dataset.busy = '1';
      scrambleTo(el, original, 420);
      setTimeout(() => { el.dataset.busy = '0'; }, 440);
    });
  });
}

// ---------------------------------------------------------------------------
// 3. TILT — the card leans toward the pointer and a sheen tracks across it.
//    Small angles only; past about 8deg it stops reading as depth.
// ---------------------------------------------------------------------------
export function initTilt() {
  if (reduced() || isTouch()) return;

  $$('[data-tilt]').forEach((el) => {
    const strength = Number(el.dataset.tilt) || 7;
    let rx = 0, ry = 0, tx = 0, ty = 0, sx = 50, sy = 50, active = false;

    el.style.transformStyle = 'preserve-3d';

    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ty = (px - 0.5) * strength * 2;
      tx = -(py - 0.5) * strength * 2;
      sx = px * 100;
      sy = py * 100;
      active = true;
      el.style.setProperty('--sheen-x', `${sx}%`);
      el.style.setProperty('--sheen-y', `${sy}%`);
      el.classList.add('is-tilting');
    });

    el.addEventListener('pointerleave', () => {
      tx = 0; ty = 0; active = false;
      el.classList.remove('is-tilting');
    });

    onTick(() => {
      if (!active && Math.abs(rx) < 0.01 && Math.abs(ry) < 0.01) return;
      rx = lerp(rx, tx, 0.12);
      ry = lerp(ry, ty, 0.12);
      el.style.transform =
        `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`;
    });
  });
}

// ---------------------------------------------------------------------------
// 4. ROLL — a readout's digits roll up into place. Only the numeric part is
//    animated; a unit or a symbol stays put.
// ---------------------------------------------------------------------------
export function initRoll() {
  const els = $$('[data-roll]');
  if (!els.length) return;

  if (reduced()) {
    els.forEach((el) => { el.textContent = el.dataset.roll; });
    return;
  }

  const fire = (el) => {
    if (el.dataset.done === '1') return;
    el.dataset.done = '1';

    const target = Number(el.dataset.roll);
    if (Number.isNaN(target)) { el.textContent = el.dataset.roll; return; }
    const decimals = (el.dataset.roll.split('.')[1] || '').length;

    const start = performance.now();
    const dur = 1500;
    const step = (now) => {
      const p = clamp((now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(decimals);
    };
    requestAnimationFrame(step);
  };

  observe(els, (el, inView) => { if (inView) fire(el); }, { threshold: 0.5 });

  // Fallback: whatever the observer does, no readout may sit at 0 forever.
  setTimeout(() => els.forEach((el) => {
    if (el.dataset.done !== '1') el.textContent = el.dataset.roll;
  }), 4000);
}

export function initEffects() {
  initFit();
  initScramble();
  initTilt();
  initRoll();
}
