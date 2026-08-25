// ---------------------------------------------------------------------------
// main.js — boot order.
//   render DOM from data  ->  wire motion  ->  start the heavy canvases
// The two canvases start only after the preloader clears, so nothing competes
// with first paint.
// ---------------------------------------------------------------------------

import { $, $$, splitWords, reduced } from './utils.js';
import { initTheme } from './theme.js';
import { initPreloader } from './preloader.js';
import { initGrain } from './grain.js';
import { initCursor } from './cursor.js';
import {
  initReveals, initScrollEngine, initChrome, initPin, initTimeline, initAnchors,
} from './scroll.js';
import { renderAll } from './render.js';
import { initHeroGL } from './hero-gl.js';
import { initSignal } from './signal.js';
import { initMarquees } from './marquee.js';
import { initMatch } from './match.js';
import { initQuery } from './query.js';
import { initEffects } from './effects.js';
import { initPatchbay } from './patchbay.js';
import { initBench } from './bench.js';
import { initHistorian } from './historian.js';
import { initInstruments } from './instruments.js';

function splitHeadlines() {
  $$('[data-split]').forEach((el) => {
    const delay = Number(el.dataset.delay || 0);
    const step = Number(el.dataset.step || 55);
    splitWords(el, delay, step);
  });
}

function boot() {
  initTheme();
  renderAll();
  splitHeadlines();

  initScrollEngine();
  initReveals();
  initChrome();
  initPin();
  initTimeline();
  initAnchors();
  initMarquees();
  initGrain();
  initCursor();

  initMatch();
  initQuery();

  initPatchbay();
  initHistorian();
  initInstruments();

  document.querySelector('[data-print]')?.addEventListener('click', () => window.print());

  // effects run last: fit measures type, so the DOM must be final
  initEffects();

  initPreloader(() => {
    // hero reveal is released by the boot sequence, not by the observer
    $$('.hero [data-reveal], .hero .msk').forEach((el) => el.classList.add('is-in'));
    initHeroGL($('.hero__gl'));
    initSignal();
    initBench();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
