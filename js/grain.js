// ---------------------------------------------------------------------------
// grain.js — one generated noise tile, drifted a few pixels per frame.
// This layer is what stops the page reading as flat CSS.
// ---------------------------------------------------------------------------

import { $, onTick, reduced } from './utils.js';

export function initGrain() {
  const el = $('.grain');
  if (!el) return;

  const size = 180;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;

  if (reduced()) return;

  // step the tile on a coarse interval — continuous motion here is nauseating
  let last = 0;
  const positions = [[0, 0], [-11, 7], [6, -13], [-4, -6], [13, 4], [-9, 12]];
  let i = 0;
  onTick((t) => {
    if (t - last < 90) return;
    last = t;
    i = (i + 1) % positions.length;
    el.style.transform = `translate3d(${positions[i][0]}px, ${positions[i][1]}px, 0)`;
  });
}
