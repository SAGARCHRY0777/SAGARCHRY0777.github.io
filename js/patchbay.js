// ---------------------------------------------------------------------------
// patchbay.js — the variant patch bay.
//
// Five rocker switches carrying his real resume tags. Flip one and every
// project on the page is re-scored live: systems reorder, bullets reorder
// inside them, and anything below the relevance floor dims out.
//
// This is not a filter UI dressed up. It is the SAME weighting that generates
// the five resume variants — `weight` and `tags` come straight out of
// profile.json — so what a visitor sees is the machinery, not a mock of it.
//
// Reordering uses FLIP (First-Last-Invert-Play): measure, mutate, invert with
// a transform, then release. Nothing animates layout.
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, $$, escapeHtml, reduced } from './utils.js';
import { systemsInOrder } from './render.js';

export const LANES = [
  { key: 'industrial', label: 'Industrial', sub: 'IT-OT · IIoT' },
  { key: 'genai',      label: 'GenAI',      sub: 'RAG · agents' },
  { key: 'cv',         label: 'Vision',     sub: 'CV · ADAS' },
  { key: 'mlops',      label: 'MLOps',      sub: 'serving · scale' },
  { key: 'backend',    label: 'Backend',    sub: 'distributed' },
];

const BOOST = 1.7;          // per matched tag
const FLOOR = 0.55;         // dim anything under this share of the card's best

const active = new Set();

/** weight × (1 + boost per matched tag) — the resume builder's own formula */
function scoreOf(tags, weight) {
  if (!active.size) return weight;
  let hits = 0;
  tags.forEach((t) => { if (active.has(t)) hits++; });
  return weight * (1 + BOOST * hits);
}

// --- FLIP -------------------------------------------------------------------
function flip(parent, mutate) {
  const kids = Array.from(parent.children);
  if (reduced()) { mutate(); return; }

  const first = new Map();
  kids.forEach((k) => first.set(k, k.getBoundingClientRect().top));

  mutate();

  kids.forEach((k) => {
    const before = first.get(k);
    if (before == null) return;
    const after = k.getBoundingClientRect().top;
    const dy = before - after;
    if (!dy) return;
    k.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
      { duration: 720, easing: 'cubic-bezier(0.16,1,0.30,1)' }
    );
  });
}

// ---------------------------------------------------------------------------
export function initPatchbay() {
  const bank = $('[data-patchbay]');
  const host = $('[data-systems]');
  if (!bank || !host) return;

  bank.innerHTML = LANES.map((l) => `
    <button class="rocker" role="switch" aria-checked="false" data-lane="${l.key}">
      <span class="rocker__body" aria-hidden="true"><i></i></span>
      <span class="rocker__text">
        <b>${escapeHtml(l.label)}</b>
        <em>${escapeHtml(l.sub)}</em>
      </span>
    </button>`).join('') +
    `<button class="rocker rocker--reset" data-lane="__reset">
       <span class="rocker__text"><b>Reset</b><em>all lanes off</em></span>
     </button>`;

  const readout = $('[data-patch-readout]');

  function apply() {
    // ---- bullets first, so the card totals are current -------------------
    let selected = 0;
    let total = 0;

    $$('[data-sys]', host).forEach((card) => {
      const points = $$('.sys__point', card);
      if (!points.length) return;

      const scored = points.map((el) => ({
        el,
        s: scoreOf((el.dataset.tags || '').split(' ').filter(Boolean), Number(el.dataset.w) || 5),
      }));
      const best = Math.max(...scored.map((x) => x.s));
      if (active.size) scored.sort((a, b) => b.s - a.s);   // lanes off = profile order

      const list = points[0].parentElement;
      flip(list, () => {
        scored.forEach((x) => {
          const quiet = active.size > 0 && x.s < best * FLOOR;
          x.el.classList.toggle('is-quiet', quiet);
          if (!quiet) { selected++; total += x.s; }
          list.appendChild(x.el);
        });
        // the links block lives in the same list — keep it last
        const links = list.querySelector('.sys__links');
        if (links) list.appendChild(links);
      });

      card.dataset.score = scored.reduce((n, x) => n + x.s, 0).toFixed(0);
    });

    // ---- then the systems themselves -------------------------------------
    const cards = $$('[data-sys]', host);
    cards.forEach((c, i) => { if (!c.dataset.rank) c.dataset.rank = String(i); });
    const order = active.size
      ? [...cards].sort((a, b) => Number(b.dataset.score) - Number(a.dataset.score))
      : [...cards].sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank));
    flip(host, () => order.forEach((c) => host.appendChild(c)));

    cards.forEach((c) => {
      const tags = (c.dataset.tags || '').split(' ');
      c.classList.toggle('is-lane', active.size > 0 && tags.some((t) => active.has(t)));
      $$('.tag', c).forEach((t) => t.classList.toggle('is-hit', active.has(t.dataset.tag)));
    });

    if (readout) {
      readout.textContent = active.size
        ? `${selected} bullets held · score ${Math.round(total)} · lanes ${[...active].join(' + ')}`
        : `all lanes open · ${selected} bullets · unweighted order`;
    }
  }

  bank.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-lane]');
    if (!btn) return;

    if (btn.dataset.lane === '__reset') {
      active.clear();
      $$('[data-lane]', bank).forEach((b) => {
        b.classList.remove('is-on');
        if (b.getAttribute('role') === 'switch') b.setAttribute('aria-checked', 'false');
      });
    } else {
      const key = btn.dataset.lane;
      active.has(key) ? active.delete(key) : active.add(key);
      btn.classList.toggle('is-on', active.has(key));
      btn.setAttribute('aria-checked', String(active.has(key)));
    }
    apply();
  });

  applyFn = apply;
  apply();
}

let applyFn = null;   // set by initPatchbay so throwLane can re-run the pass

/** The matcher calls this so analysing a JD physically throws the switches. */
export function throwLane(key) {
  const bank = $('[data-patchbay]');
  if (!bank || !applyFn || !LANES.some((l) => l.key === key)) return;
  active.clear();
  active.add(key);
  $$('[data-lane]', bank).forEach((b) => {
    const on = b.dataset.lane === key;
    b.classList.toggle('is-on', on);
    if (b.getAttribute('role') === 'switch') b.setAttribute('aria-checked', String(on));
  });
  applyFn();
}

export const systemCount = () => systemsInOrder().length;
