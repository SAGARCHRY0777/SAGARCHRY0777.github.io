// ---------------------------------------------------------------------------
// style.js — twenty-two treatments, one switcher.
//
// The second axis. theme.js chooses the PALETTE; this chooses the FORM —
// typeface, corner, hairline, depth, texture. They are orthogonal on purpose:
// every style works on every palette, so the two menus never fight.
//
// Three things this file is careful about:
//
//   1. It changes appearance only. Every style is token overrides in
//      styles.css; nothing here adds, removes or reorders behaviour, and no
//      style rule may create a containing block or move an element, because
//      the scroll engine, the pin and the fitted headline all measure the
//      layout they were given.
//   2. A style that changes the typeface changes text metrics, so after every
//      swap it re-runs the site's OWN measurement hooks — refit() and a resize
//      event. That is what keeps behaviour identical rather than merely
//      unbroken: the same code that handles a window resize handles this.
//   3. Webfonts load on demand. A visitor who never opens the menu downloads
//      nothing extra; the base three families are unchanged.
// ---------------------------------------------------------------------------

import { $, reduced } from './utils.js';
import { refit } from './effects.js';

const KEY = 'sc-style';

// `font` is the query string appended to the Google Fonts css2 endpoint, or
// null where the style is built from the three families already loaded.
// `chip` is two literal colours previewing the treatment — it must NOT follow
// the active tokens, or all twenty-three rows would render identically.
export const STYLES = [
  // --- the ground state ----------------------------------------------------
  { id: '',              name: 'Instrument',    group: 'Default',    chip: ['#0A0908', '#FF7A18'], font: null },

  // --- structural: the style is in the grid and the restraint ---------------
  { id: 'minimalism',    name: 'Minimalism',    group: 'Structural', chip: ['#FFFFFF', '#111111'], font: null },
  { id: 'swiss',         name: 'Swiss',         group: 'Structural', chip: ['#FFFFFF', '#D8121C'], font: null },
  { id: 'editorial',     name: 'Editorial',     group: 'Structural', chip: ['#FBFAF7', '#1A1A1A'], font: 'Playfair+Display:wght@500;700&family=Newsreader:opsz,wght@6..72,400;6..72,500' },
  { id: 'vector-art',    name: 'Vector art',    group: 'Structural', chip: ['#FFD400', '#111111'], font: null },

  // --- surface: the style is in the material --------------------------------
  { id: 'glassmorphism', name: 'Glassmorphism', group: 'Surface',    chip: ['#5AA9FF', '#CFE8FF'], font: null },
  { id: 'liquid-glass',  name: 'Liquid glass',  group: 'Surface',    chip: ['#1B2733', '#9FD9FF'], font: null },
  { id: 'neumorphism',   name: 'Neumorphism',   group: 'Surface',    chip: ['#E5E6EA', '#C9CBD1'], font: null },
  { id: 'clay',          name: 'Clay',          group: 'Surface',    chip: ['#F08A5D', '#B83B5E'], font: 'Fredoka:wght@400;600' },
  { id: 'aurora',        name: 'Aurora',        group: 'Surface',    chip: ['#6BF0C8', '#A78BFA'], font: null },

  // --- era: the style is a date ---------------------------------------------
  { id: 'retro',         name: 'Retro',         group: 'Era',        chip: ['#E8743B', '#F2B33D'], font: 'Righteous' },
  { id: 'y2k',           name: 'Y2K',           group: 'Era',        chip: ['#C0C7D0', '#FF64C8'], font: 'Iceland' },
  { id: 'victorian',     name: 'Victorian',     group: 'Era',        chip: ['#7B2D26', '#2F4B3F'], font: 'IM+Fell+English+SC&family=Newsreader:opsz,wght@6..72,400' },
  { id: 'pixel-art',     name: 'Pixel art',     group: 'Era',        chip: ['#2B2B2B', '#6BFF7C'], font: 'Silkscreen:wght@400;700' },
  { id: 'cyberpunk',     name: 'Cyberpunk',     group: 'Era',        chip: ['#FF2E88', '#00F0FF'], font: 'Chakra+Petch:wght@400;600;700' },
  { id: 'futuristic',    name: 'Futuristic',    group: 'Era',        chip: ['#05080E', '#35D6C4'], font: 'Orbitron:wght@400..900' },

  // --- expressive: the style is the point -----------------------------------
  { id: 'maximalism',    name: 'Maximalism',    group: 'Expressive', chip: ['#FF7A18', '#35D6C4'], font: 'Bungee' },
  { id: 'pop-art',       name: 'Pop art',       group: 'Expressive', chip: ['#FF2B4E', '#FFD400'], font: 'Bungee' },
  { id: 'collage-art',   name: 'Collage art',   group: 'Expressive', chip: ['#D9C8A9', '#3B3B3B'], font: 'Alfa+Slab+One' },
  { id: 'graffiti',      name: 'Graffiti',      group: 'Expressive', chip: ['#FF3D00', '#00E676'], font: 'Permanent+Marker' },
  { id: 'surreal',       name: 'Surreal',       group: 'Expressive', chip: ['#F2C14E', '#7B5EA7'], font: 'Abril+Fatface' },
  { id: 'bohemian',      name: 'Bohemian',      group: 'Expressive', chip: ['#B5651D', '#6E7F5C'], font: 'Cormorant+Garamond:wght@400;600;700' },
  { id: 'handwritten',   name: 'Handwritten',   group: 'Expressive', chip: ['#FBFAF7', '#2C4A7C'], font: 'Caveat:wght@400;600;700' },
];

const GROUPS = ['Default', 'Structural', 'Surface', 'Era', 'Expressive'];

const $$opts = () => Array.from(document.querySelectorAll('.styler__opt'));

/**
 * Shut this menu from the outside.
 *
 * Both dropdowns hang off the right edge of the header, so two open at once
 * would overlap. Each trigger stops propagation to protect its own toggle,
 * which means neither can see the other's click -- so they close each other
 * explicitly instead. Exported for theme.js; the mirror of it lives there.
 */
export function closeStyleMenu() {
  const host = document.querySelector('.styler');
  if (!host || !host.classList.contains('is-open')) return;
  host.classList.remove('is-open');
  host.querySelector('[data-style-toggle]')?.setAttribute('aria-expanded', 'false');
  const panel = host.querySelector('.styler__panel');
  if (panel) panel.hidden = true;
}

function closeThemeMenu() {
  const host = document.querySelector('.themer');
  if (!host || !host.classList.contains('is-open')) return;
  host.classList.remove('is-open');
  host.querySelector('[data-theme-toggle]')?.setAttribute('aria-expanded', 'false');
  const panel = host.querySelector('.themer__panel');
  if (panel) panel.hidden = true;
}

// --- fonts, on demand -------------------------------------------------------
const loaded = new Set();

/**
 * Inject a style's typefaces the first time it is chosen.
 *
 * Deliberately fire-and-forget: `display=swap` means the page renders in the
 * fallback stack immediately and reflows to the webface when it lands, so a
 * slow or blocked font never delays the swap. The reflow is picked up by the
 * same remeasure() the swap already schedules.
 */
function loadFont(spec) {
  if (!spec || loaded.has(spec)) return;
  loaded.add(spec);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Re-run the site's own measurement passes.
 *
 * A typeface change moves every text box, and several modules cache geometry
 * they took at load: the fitted headline, the scroll engine's document height,
 * every canvas that sized itself to its container. All of them already listen
 * for resize, so the honest way to keep them correct is to tell them the
 * layout moved rather than to reach into each one.
 *
 * Deferred twice: once past the style's own paint, once more past the webfont
 * swap that follows a cold load.
 */
function remeasure() {
  const run = () => { refit(); window.dispatchEvent(new Event('resize')); };
  requestAnimationFrame(run);
  if (document.fonts?.ready) document.fonts.ready.then(run).catch(() => {});
  else setTimeout(run, 600);
}

function stamp(id) {
  const root = document.documentElement;
  // '' is the ground state — no attribute at all, so the base tokens apply
  // exactly as they did before this file existed.
  if (id) root.setAttribute('data-style', id);
  else root.removeAttribute('data-style');

  $$opts().forEach((b) => {
    const on = b.dataset.style === id;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-checked', String(on));
  });
  remeasure();
}

// One view transition owns one snapshot of the root, so overlapping swaps
// would fight over it. While one is in flight the next press just stamps.
let swapping = false;

function swap(id) {
  loadFont(STYLES.find((s) => s.id === id)?.font);

  if (reduced()) { stamp(id); return; }

  if (typeof document.startViewTransition === 'function') {
    if (swapping) { stamp(id); return; }
    swapping = true;
    const vt = document.startViewTransition(() => stamp(id));
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

export function currentStyle() {
  return document.documentElement.getAttribute('data-style') || '';
}

export function initStyle() {
  const host = $('.styler');

  let stored = null;
  try { stored = localStorage.getItem(KEY); } catch { /* private mode */ }
  const start = STYLES.some((s) => s.id === stored) ? stored : '';

  if (host) {
    const panel = $('.styler__panel', host);
    const row = (s) => `
        <button class="styler__opt" data-style="${s.id}" role="menuitemradio" aria-checked="false">
          <span class="styler__chip" aria-hidden="true">
            ${s.chip.map((c) => `<i style="background:${c}"></i>`).join('')}
          </span>
          <span>${s.name}</span>
        </button>`;

    panel.innerHTML =
      `<p class="label styler__title">Style &mdash; ${STYLES.length}</p>` +
      GROUPS.map((g) => {
        const rows = STYLES.filter((s) => s.group === g);
        if (!rows.length) return '';
        return `<p class="label styler__group">${g} &middot; ${rows.length}</p>`
             + rows.map(row).join('');
      }).join('');

    const trigger = $('[data-style-toggle]', host);

    // closed = out of the tab order as well as out of sight
    const setOpen = (open) => {
      if (open) closeThemeMenu();
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
      const btn = e.target.closest('[data-style]');
      if (!btn) return;
      const id = btn.dataset.style;
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

      // quick cycle on bare S — matching the existing T for palette. Never
      // steal a modifier combo, and never fire while a field or slider is
      // focused, which is the same guard theme.js uses.
      const a = document.activeElement;
      const typing = a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable
        || a.getAttribute('role') === 'slider');
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && !typing) {
        const i = STYLES.findIndex((s) => s.id === currentStyle());
        const next = STYLES[(i + 1) % STYLES.length].id;
        swap(next);
        try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
      }
    });
  }

  loadFont(STYLES.find((s) => s.id === start)?.font);
  stamp(start);
}
