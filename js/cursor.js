// ---------------------------------------------------------------------------
// cursor.js — dot tracks 1:1, ring lags on a lerp, and hover targets pull
// the ring toward their centre (magnetic). Pointer-fine devices only.
// ---------------------------------------------------------------------------

import { $, lerp, onTick, isTouch, reduced } from './utils.js';

export function initCursor() {
  if (isTouch() || reduced()) return;

  const dot  = $('.cur');
  const ring = $('.cur-ring');
  if (!dot || !ring) return;

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;
  let magnet = null;

  document.body.classList.add('cursor-on');

  window.addEventListener('pointermove', (e) => {
    mx = e.clientX; my = e.clientY;
  }, { passive: true });

  window.addEventListener('pointerdown', () => ring.style.setProperty('transform', ring.style.transform + ' scale(0.82)'));

  // hover targets ------------------------------------------------------------
  const HOT = 'a, button, [data-magnet], input, textarea, summary';
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest(HOT);
    if (!t) return;
    document.body.classList.add('cursor-hot');
    if (t.hasAttribute('data-magnet')) magnet = t;
  });
  document.addEventListener('pointerout', (e) => {
    if (!e.target.closest(HOT)) return;
    document.body.classList.remove('cursor-hot');
    if (magnet) {
      magnet.style.transform = '';
      magnet = null;
    }
  });

  onTick(() => {
    // ring follows on a lerp — the lag is what makes it feel weighted
    rx = lerp(rx, mx, 0.16);
    ry = lerp(ry, my, 0.16);

    let tx = rx, ty = ry;

    if (magnet) {
      const r = magnet.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = mx - cx;
      const dy = my - cy;
      const pull = 0.34;
      // the element itself moves a little toward the cursor
      magnet.style.transform = `translate3d(${dx * 0.22}px, ${dy * 0.3}px, 0)`;
      // and the ring snaps toward the element's centre
      tx = cx + dx * pull;
      ty = cy + dy * pull;
    }

    dot.style.transform  = `translate3d(${mx}px, ${my}px, 0)`;
    ring.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  });
}
