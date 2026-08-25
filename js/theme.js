// ---------------------------------------------------------------------------
// theme.js — six palettes, one switcher.
//
// The stylesheet owns every colour; this file only stamps data-theme on the
// root and runs the wipe that hides the swap. Nothing here knows a hex value
// except the swatches, which must show the palette they are OFFERING rather
// than the one currently on.
// ---------------------------------------------------------------------------

import { $, reduced } from './utils.js';

const KEY = 'sc-theme';
const listeners = new Set();

export const THEMES = [
  { id: 'sodium',    name: 'Sodium',    sw: ['#0A0908', '#FF7A18', '#35D6C4'], scheme: 'dark'  },
  { id: 'phosphor',  name: 'Phosphor',  sw: ['#050A06', '#6BFF7C', '#F2C14E'], scheme: 'dark'  },
  { id: 'ice',       name: 'Ice',       sw: ['#05080E', '#5AA9FF', '#9AF0FF'], scheme: 'dark'  },
  { id: 'plasma',    name: 'Plasma',    sw: ['#08060E', '#FF4DA6', '#A78BFA'], scheme: 'dark'  },
  { id: 'datasheet', name: 'Datasheet', sw: ['#EDEAE3', '#C4520A', '#0C8F82'], scheme: 'light' },
  { id: 'blueprint', name: 'Blueprint', sw: ['#E2E9F0', '#15568F', '#B0530C'], scheme: 'light' },
];

const ALIAS = { dark: 'sodium', light: 'datasheet' };

export function currentTheme() {
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped) return ALIAS[stamped] || stamped;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'datasheet' : 'sodium';
}

function stamp(id) {
  document.documentElement.setAttribute('data-theme', id);
  $$opts().forEach((b) => b.classList.toggle('is-on', b.dataset.theme === id));
  const label = $('[data-theme-name]');
  if (label) label.textContent = THEMES.find((t) => t.id === id)?.name || id;
  listeners.forEach((fn) => fn(id));
}

const $$opts = () => Array.from(document.querySelectorAll('.themer__opt'));

/**
 * Swap under a sweep. The wipe covers the viewport at the moment the tokens
 * change, so the palette never flips in a frame the eye can catch.
 */
function swap(id) {
  if (reduced()) { stamp(id); return; }

  let wipe = $('.themewipe');
  if (!wipe) {
    wipe = document.createElement('div');
    wipe.className = 'themewipe';
    wipe.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wipe);
  }

  wipe.classList.remove('is-in');
  void wipe.offsetWidth;              // restart the animation
  wipe.classList.add('is-in');
  setTimeout(() => stamp(id), 380);   // mid-sweep, while the screen is covered
}

export function onThemeChange(fn) { listeners.add(fn); }

export function initTheme() {
  const host = $('.themer');

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
  const start = THEMES.some((t) => t.id === stored) ? stored : currentTheme();

  // --- build the menu -------------------------------------------------------
  if (host) {
    const panel = $('.themer__panel', host);
    panel.innerHTML =
      `<p class="label themer__title">Palette</p>` +
      THEMES.map((t) => `
        <button class="themer__opt" data-theme="${t.id}" role="menuitemradio">
          <span class="themer__sw" aria-hidden="true">
            ${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}
          </span>
          <span>${t.name}</span>
        </button>`).join('');

    const trigger = $('[data-theme-toggle]', host);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      host.classList.toggle('is-open');
      trigger.setAttribute('aria-expanded', String(host.classList.contains('is-open')));
    });

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme]');
      if (!btn) return;
      const id = btn.dataset.theme;
      swap(id);
      try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
      host.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('click', (e) => {
      if (!host.contains(e.target)) host.classList.remove('is-open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') host.classList.remove('is-open');
      // quick cycle: press T
      if (e.key === 't' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) {
        const i = THEMES.findIndex((t) => t.id === currentTheme());
        const next = THEMES[(i + 1) % THEMES.length].id;
        swap(next);
        try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      }
    });
  }

  stamp(start);

  // follow the OS while the visitor has never chosen
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (!saved) stamp(currentTheme());
  });
}
