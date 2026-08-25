// ---------------------------------------------------------------------------
// historian.js — the trend cursor.
//
// A draggable cursor over the trajectory, the way a historian client
// (PI, Ignition) interrogates the past: park it on a month and the side card
// answers "what was true then" — role held, education in progress, and every
// certification already earned by that date. All of it filtered from dated
// events compiled out of profile.json; nothing is written here.
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, clamp, escapeHtml, reduced } from './utils.js';

const MON_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toNum = (iso) => {                     // "2025-04" -> 2025*12+3
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + (m - 1);
};
const label = (n) => `${MON_ABBR[n % 12]} ${Math.floor(n / 12)}`;

export function initHistorian() {
  const host = $('[data-historian]');
  if (!host) return;

  const events = DATA.history;
  const t0 = Math.min(...events.map((e) => toNum(e.start)));
  const now = new Date();
  const t1 = now.getFullYear() * 12 + now.getMonth();
  const span = t1 - t0;

  host.innerHTML = `
    <div class="hist__strip" data-hist-strip tabindex="0" role="slider"
         aria-label="Career date cursor" aria-valuemin="0" aria-valuemax="${span}">
      <canvas class="hist__bands" data-hist-bands aria-hidden="true"></canvas>
      <div class="hist__cursor" data-hist-cursor aria-hidden="true">
        <span class="hist__flag" data-hist-flag></span>
      </div>
    </div>
    <div class="hist__card mono" data-hist-card aria-live="polite"></div>`;

  const strip  = $('[data-hist-strip]', host);
  const bands  = $('[data-hist-bands]', host);
  const cursor = $('[data-hist-cursor]', host);
  const flag   = $('[data-hist-flag]', host);
  const card   = $('[data-hist-card]', host);

  // ---- bands: one lane per kind, drawn once --------------------------------
  const LANES = { education: 0, role: 1, cert: 2, award: 2 };

  function drawBands() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = strip.clientWidth, h = strip.clientHeight;
    bands.width = w * dpr; bands.height = h * dpr;
    const ctx = bands.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const css = getComputedStyle(document.documentElement);
    const colors = {
      education: css.getPropertyValue('--ink-faint').trim(),
      role: css.getPropertyValue('--sodium').trim(),
      cert: css.getPropertyValue('--trace').trim(),
      award: css.getPropertyValue('--trace').trim(),
    };

    const xOf = (n) => ((n - t0) / span) * w;
    const laneH = h / 3;

    events.forEach((e) => {
      const lane = LANES[e.kind] ?? 2;
      const y = lane * laneH + laneH * 0.34;
      const a = xOf(toNum(e.start));
      const b = e.end ? xOf(toNum(e.end)) : (e.kind === 'cert' || e.kind === 'award' ? a + 5 : w);
      ctx.fillStyle = colors[e.kind];
      ctx.globalAlpha = e.kind === 'role' ? 0.9 : 0.55;
      ctx.fillRect(a, y, Math.max(4, b - a), laneH * 0.3);
    });
    ctx.globalAlpha = 1;

    // year ticks
    ctx.fillStyle = colors.education;
    ctx.font = '500 9px "IBM Plex Mono", monospace';
    for (let n = Math.ceil(t0 / 12) * 12; n <= t1; n += 12) {
      const x = xOf(n);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x, 0, 1, h);
      ctx.globalAlpha = 1;
      ctx.fillText(String(n / 12), x + 4, h - 4);
    }
  }

  // ---- the cursor ----------------------------------------------------------
  let pos = span;                      // start at "now"

  function paint() {
    const x = (pos / span) * strip.clientWidth;
    cursor.style.transform = `translateX(${x.toFixed(1)}px)`;
    const t = t0 + pos;
    flag.textContent = label(t);
    strip.setAttribute('aria-valuenow', String(pos));
    strip.setAttribute('aria-valuetext', label(t));

    const current = events.filter((e) => {
      const s = toNum(e.start);
      const en = e.end ? toNum(e.end) : t1;
      return s <= t && (e.kind === 'cert' || e.kind === 'award' ? true : t <= en);
    });

    const roles  = current.filter((e) => e.kind === 'role' && (!e.end || t <= toNum(e.end)));
    const edu    = current.filter((e) => e.kind === 'education' && t <= toNum(e.end || '9999-01'));
    const earned = current.filter((e) => (e.kind === 'cert' || e.kind === 'award') && toNum(e.start) <= t);

    const row = (k, v) =>
      `<div class="hist__row"><span class="label">${k}</span><span>${v}</span></div>`;

    card.innerHTML =
      `<p class="label label--accent" style="margin-bottom:var(--s-3)">STATE @ ${label(t)}</p>` +
      row('Role', roles.length
        ? roles.map((r) => escapeHtml(r.label)).join('<br>')
        : (edu.length ? 'Student' : '—')) +
      (edu.length ? row('Studying', edu.map((r) => escapeHtml(r.label)).join('<br>')) : '') +
      row('Earned by then', earned.length
        ? `${earned.length} — ${earned.slice(-2).map((r) => escapeHtml(r.label.split(':')[0])).join(' · ')}`
        : 'nothing yet') +
      (roles.length ? row('In flight', escapeHtml(roles[0].detail)) : '');
  }

  function setFromClientX(cx) {
    const r = strip.getBoundingClientRect();
    pos = Math.round(clamp((cx - r.left) / r.width) * span);
    paint();
  }

  strip.addEventListener('pointerdown', (e) => {
    strip.setPointerCapture(e.pointerId);
    setFromClientX(e.clientX);
  });
  strip.addEventListener('pointermove', (e) => {
    if (strip.hasPointerCapture?.(e.pointerId)) setFromClientX(e.clientX);
  });
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { pos = clamp(pos + 1, 0, span); paint(); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { pos = clamp(pos - 1, 0, span); paint(); e.preventDefault(); }
    if (e.key === 'Home') { pos = 0; paint(); e.preventDefault(); }
    if (e.key === 'End')  { pos = span; paint(); e.preventDefault(); }
  });

  window.addEventListener('resize', () => { drawBands(); paint(); }, { passive: true });

  drawBands();
  paint();

  // bands use theme colours — repaint when the palette changes
  new MutationObserver(() => drawBands())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // a gentle intro sweep, once, unless motion is reduced
  if (!reduced()) {
    let p = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || strip.dataset.swept) return;
      strip.dataset.swept = '1';
      const sweep = () => {
        p += 0.02;
        pos = Math.round(Math.min(1, p) * span);
        paint();
        if (p < 1) requestAnimationFrame(sweep);
      };
      requestAnimationFrame(sweep);
      io.disconnect();
    }, { threshold: 0.4 });
    io.observe(strip);
  }
}
