// ---------------------------------------------------------------------------
// utils.js — tiny shared helpers. No dependencies anywhere in this project.
// ---------------------------------------------------------------------------

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp  = (a, b, t) => a + (b - a) * t;
export const map   = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
export const round = (v, p = 2) => Number(v.toFixed(p));

/** Honours the OS setting, live — the page reacts if it is changed mid-visit. */
const rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => rmQuery.matches;
export const onReducedChange = (fn) => rmQuery.addEventListener('change', fn);

export const isTouch = () =>
  window.matchMedia('(hover: none), (pointer: coarse)').matches;

// --- one shared rAF loop ----------------------------------------------------
const ticks = new Set();
let running = false;

function frame(t) {
  ticks.forEach((fn) => {
    try { fn(t); } catch (err) { console.warn('[tick]', err); ticks.delete(fn); }
  });
  if (ticks.size) requestAnimationFrame(frame);
  else running = false;
}

export function onTick(fn) {
  ticks.add(fn);
  if (!running) { running = true; requestAnimationFrame(frame); }
  return () => ticks.delete(fn);
}

// --- intersection ------------------------------------------------------------
export function observe(els, cb, opts = {}) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => cb(e.target, e.isIntersecting, e));
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12, ...opts });
  els.forEach((el) => io.observe(el));
  return io;
}

// --- text splitting ----------------------------------------------------------
/**
 * Wraps every word in a mask so it can be revealed on a stagger.
 * Words, not characters: characters break screen readers and cost layout.
 */
export function splitWords(el, baseDelay = 0, step = 55) {
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', words.join(' '));
  el.textContent = '';
  el.classList.add('wsplit');
  words.forEach((w, i) => {
    const span = document.createElement('span');
    span.className = 'msk';
    span.setAttribute('aria-hidden', 'true');
    span.style.setProperty('--rv-delay', `${baseDelay + i * step}ms`);
    const inner = document.createElement('i');
    inner.textContent = w;
    span.appendChild(inner);
    el.appendChild(span);
  });
  return el;
}

// --- formatting --------------------------------------------------------------
export const pad = (n, w = 2) => String(n).padStart(w, '0');

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** #RRGGBB (or any computed colour) -> [r,g,b] in 0..1 for WebGL uniforms. */
export function cssColorToVec3(value) {
  const v = value.trim();
  const hex = v.match(/^#?([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  const rgb = v.match(/(\d+(?:\.\d+)?)/g);
  if (rgb && rgb.length >= 3) return rgb.slice(0, 3).map((c) => Number(c) / 255);
  return [0, 0, 0];
}

export const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
