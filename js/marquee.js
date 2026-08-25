// ---------------------------------------------------------------------------
// marquee.js — infinite loop whose speed is modulated by scroll velocity.
// Two rows running opposite ways, so scrolling shears them apart.
// ---------------------------------------------------------------------------

import { $$, clamp, onTick, reduced } from './utils.js';
import { scrollState } from './scroll.js';

export function initMarquees() {
  const rows = $$('.marquee');
  if (!rows.length) return;

  const soft = reduced();

  rows.forEach((row) => {
    const track = row.querySelector('.marquee__track');
    if (!track) return;

    // duplicate until the track is at least twice the viewport, so the
    // wrap point is always off-screen
    const original = track.innerHTML;
    let guard = 0;
    while (track.scrollWidth < window.innerWidth * 2 && guard++ < 12) {
      track.innerHTML += original;
    }

    const dir = row.dataset.dir === 'rtl' ? -1 : 1;
    const base = Number(row.dataset.speed || 0.35);
    const width = track.scrollWidth / 2;
    let x = dir < 0 ? -width : 0;

    if (soft) return;

    onTick(() => {
      // scroll velocity adds to the base drift — the loop reacts to the reader
      const boost = clamp(scrollState.velocity * 0.35, -14, 14);
      x -= (base + Math.abs(boost) * 0.5) * dir + boost * dir * 0.4;

      if (dir > 0 && x <= -width) x += width;
      if (dir > 0 && x > 0) x -= width;
      if (dir < 0 && x >= 0) x -= width;
      if (dir < 0 && x < -width * 2) x += width;

      track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    });
  });
}
