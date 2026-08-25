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
  { id: 'paper',     name: 'Paper',     sw: ['#FBFAF7', '#C2410C', '#0E7C74'], scheme: 'light' },
  { id: 'sand',      name: 'Sand',      sw: ['#EAE2D4', '#A8480C', '#0B6E63'], scheme: 'light' },
  { id: 'mint',      name: 'Mint',      sw: ['#E5EDE8', '#A8450F', '#0F6E8C'], scheme: 'light' },
  { id: 'linen',     name: 'Linen',     sw: ['#F2EDE1', '#97331F', '#12665F'], scheme: 'light' },
  { id: 'ledger',    name: 'Ledger',    sw: ['#E4EBDF', '#A82717', '#2D4A8A'], scheme: 'light' },
  { id: 'ash',       name: 'Ash',       sw: ['#DDDAD5', '#B4700A', '#16607F'], scheme: 'light' },
  { id: 'slate',     name: 'Slate',     sw: ['#E3E6E9', '#C33A16', '#0A6E86'], scheme: 'light' },
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
  $$opts().forEach((b) => {
    const on = b.dataset.theme === id;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
  listeners.forEach((fn) => fn(id));
}

const $$opts = () => Array.from(document.querySelectorAll('.themer__opt'));

// A view transition owns one snapshot of the whole root, so two overlapping
// swaps would fight over it. While one is in flight the next press just stamps.
let swapping = false;

/**
 * Swap under a sweep. The wipe covers the viewport at the moment the tokens
 * change, so the palette never flips in a frame the eye can catch.
 *
 * Where the browser can snapshot the page itself it does that covering for us,
 * and better: startViewTransition holds the old frame while the stylesheet
 * wipes the new palette over it, so the overlay is not needed on that path.
 */
function swap(id) {
  if (reduced()) { stamp(id); return; }

  if (typeof document.startViewTransition === 'function') {
    if (swapping) { stamp(id); return; }
    swapping = true;
    const vt = document.startViewTransition(() => stamp(id));
    // .finished rejects when a transition is skipped — a newer one starting, or
    // the tab going to the background. The tokens are already stamped by then,
    // so there is nothing to undo: both outcomes are the same cleanup.
    const done = () => { swapping = false; };
    vt.finished.then(done, done);
    return;
  }

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
    const row = (t) => `
        <button class="themer__opt" data-theme="${t.id}" role="menuitemradio">
          <span class="themer__sw" aria-hidden="true">
            ${t.sw.map((c) => `<i style="background:${c}"></i>`).join('')}
          </span>
          <span>${t.name}</span>
        </button>`;

    const dark = THEMES.filter((t) => t.scheme === 'dark');
    const light = THEMES.filter((t) => t.scheme === 'light');

    panel.innerHTML =
      `<p class="label themer__title">Palette &mdash; ${THEMES.length}</p>` +
      `<p class="label themer__group">Dark &middot; ${dark.length}</p>` +
      dark.map(row).join('') +
      `<p class="label themer__group">Light &middot; ${light.length}</p>` +
      light.map(row).join('');

    const trigger = $('[data-theme-toggle]', host);

    // closed = hidden from the tab order as well as from the eye
    const setOpen = (open) => {
      host.classList.toggle('is-open', open);
      trigger.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      if (open) $$opts()[0]?.focus();
    };
    setOpen(false);

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!host.classList.contains('is-open'));
    });

    panel.addEventListener('keydown', (e) => {
      const opts = $$opts();
      const i = opts.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
        opts[next].focus();
      }
    });

    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-theme]');
      if (!btn) return;
      const id = btn.dataset.theme;
      swap(id);
      try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
      setOpen(false);
      trigger.focus();
    });

    document.addEventListener('click', (e) => {
      if (!host.contains(e.target) && host.classList.contains('is-open')) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && host.classList.contains('is-open')) { setOpen(false); trigger.focus(); }
      // quick cycle: press T (bare key only — never steal Ctrl+T, and never
      // while a field or a slider has focus)
      const a = document.activeElement;
      const typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable
        || a.getAttribute('role') === 'slider');
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
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
