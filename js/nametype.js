// ---------------------------------------------------------------------------
// nametype.js — the name responds to the pointer.
//
// Archivo is a variable font with a WIDTH axis (wdth 62–125), and the whole
// page is already set on it. So the name does not need a colour change or a
// glow to react — the letterforms themselves can widen under the cursor and
// narrow away from it, the way a needle deflects toward what it is measuring.
//
// The trick that makes it usable rather than annoying: the per-letter widths
// are normalised around their own mean, so widening the letters under the
// cursor narrows the rest by the same total. The line's overall width stays
// put instead of pumping in and out and reflowing the page.
//
// Pointer-fine devices only, in view only, and never under reduced motion.
// ---------------------------------------------------------------------------

import { $$, clamp, lerp, onTick, reduced, isTouch } from './utils.js';

const SPREAD = 190;      // px; how far the deflection reaches
const AMOUNT = 26;       // width units at the peak, before normalisation
const BASE = 118;        // the display face's resting width

export function initNameType() {
  const hosts = $$('[data-warp]');
  if (!hosts.length) return;

  // Bail out BEFORE splitting, not after. A touchscreen has no pointer to
  // deflect toward, so the split would buy nothing — and it costs something
  // real: letters in separate elements lose the kerning between them, which
  // widens the line and made the last letter clip on narrow screens. Phones
  // now render the name as one properly kerned word.
  if (reduced() || isTouch()) return;

  // --- split into characters ------------------------------------------------
  // splitWords already set aria-label on the line and aria-hidden on its
  // inner span, so the letters below are invisible to assistive tech and the
  // accessible name is unaffected.
  const chars = [];
  hosts.forEach((host) => {
    $$('.msk > i', host).forEach((word) => {
      const text = word.textContent;
      word.textContent = '';
      [...text].forEach((c) => {
        const el = document.createElement('b');
        el.className = 'ch';
        el.textContent = c;
        word.appendChild(el);
        chars.push({ el, w: BASE, target: BASE, x: 0 });
      });
    });
  });
  if (!chars.length) return;

  // --- geometry, recached on resize and after the fit pass settles ----------
  let measured = false;
  function measure() {
    chars.forEach((c) => {
      const r = c.el.getBoundingClientRect();
      c.x = r.left + r.width / 2;
      c.y = r.top + r.height / 2;
    });
    measured = true;
  }
  const remeasure = () => { measured = false; };
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('scroll', remeasure, { passive: true });
  document.fonts?.ready.then(remeasure);

  let px = -9999, py = -9999;
  window.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { passive: true });
  window.addEventListener('pointerleave', () => { px = -9999; py = -9999; }, { passive: true });

  let visible = true;
  hosts.forEach((h) => {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(h);
  });

  onTick(() => {
    if (!visible || document.hidden) return;
    if (!measured) measure();

    // gaussian deflection per letter, from the pointer
    let sum = 0;
    chars.forEach((c) => {
      const dx = px - c.x;
      const dy = (py - c.y) * 0.6;          // vertical influence is softer
      const d2 = (dx * dx + dy * dy) / (SPREAD * SPREAD);
      c.g = Math.exp(-d2);
      sum += c.g;
    });
    const mean = sum / chars.length;

    // normalise around the mean: what one letter gains, the others give back,
    // so the line does not grow and reflow
    let changed = false;
    chars.forEach((c) => {
      c.target = BASE + AMOUNT * (c.g - mean);
      const next = lerp(c.w, c.target, 0.14);
      if (Math.abs(next - c.w) > 0.05) {
        c.w = next;
        c.el.style.fontStretch = `${clamp(c.w, 62, 125).toFixed(1)}%`;
        changed = true;
      }
    });

    // when everything has settled, stop touching the DOM until the pointer moves
    if (!changed && px < -9000) measured = measured;
  });
}
