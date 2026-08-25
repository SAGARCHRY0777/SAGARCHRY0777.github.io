// ---------------------------------------------------------------------------
// scroll.js — the motion spine of the page.
//
// Deliberately built on NATIVE scroll rather than a transform-hijacked
// container: hijacking breaks position:sticky, and the pinned thesis section
// depends on it. The "weight" comes from a lerped scroll value that drives
// parallax, skew and the marquee, not from intercepting the wheel.
// ---------------------------------------------------------------------------

import { $, $$, clamp, lerp, map, onTick, observe, pad, reduced } from './utils.js';

export const scrollState = {
  y: 0,          // raw scrollY
  smooth: 0,     // lerped scrollY — everything parallax reads this
  velocity: 0,   // px/frame, lerped
  progress: 0,   // 0..1 down the document
};

// ---------------------------------------------------------------------------
// 1. reveals
// ---------------------------------------------------------------------------
export function initReveals() {
  const items = $$('[data-reveal], .msk');

  // stagger groups: a parent marked data-stagger delays its revealing children
  $$('[data-stagger]').forEach((group) => {
    const step = Number(group.dataset.stagger) || 70;
    $$('[data-reveal], .msk', group).forEach((child, i) => {
      if (!child.style.getPropertyValue('--rv-delay')) {
        child.style.setProperty('--rv-delay', `${i * step}ms`);
      }
    });
  });

  // Anything already inside the viewport reveals NOW — a visitor landing on
  // an anchor mid-page must never stare at hidden content while an observer
  // warms up.
  // The hero is released by the preloader when the curtain opens, so it is
  // excluded here — revealing it behind an opaque overlay wastes the entrance.
  const vh = window.innerHeight;
  items.forEach((el) => {
    if (el.closest('.hero')) return;
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.96 && r.bottom > 0) el.classList.add('is-in');
  });

  let fired = false;
  observe(items, (el, inView) => {
    if (inView) { fired = true; el.classList.add('is-in'); }
  });

  // Failsafe: if the observer never fires (odd embeds, headless, broken IO),
  // motion is forfeited but the content is not.
  setTimeout(() => {
    if (!fired) items.forEach((el) => el.classList.add('is-in'));
  }, 3500);
}

// ---------------------------------------------------------------------------
// 2. lerped scroll, parallax, velocity skew
// ---------------------------------------------------------------------------
export function initScrollEngine() {
  const paraEls = $$('[data-para]');
  const skewEls = $$('[data-skew]');
  const soft = reduced();
  const hasFx = paraEls.length || skewEls.length;

  const read = () => {
    scrollState.y = window.scrollY || 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    scrollState.progress = max > 0 ? clamp(scrollState.y / max) : 0;
  };
  read();
  scrollState.smooth = scrollState.y;

  window.addEventListener('scroll', read, { passive: true });
  window.addEventListener('resize', read, { passive: true });

  onTick(() => {
    const prev = scrollState.smooth;
    scrollState.smooth = lerp(scrollState.smooth, scrollState.y, soft ? 1 : 0.085);
    const v = scrollState.smooth - prev;
    scrollState.velocity = lerp(scrollState.velocity, v, 0.2);

    if (soft || !hasFx) return;

    // parallax — translate only, and only while the element is near the viewport
    const vh = window.innerHeight;
    paraEls.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) return;
      const depth = Number(el.dataset.para) || 0.1;
      const centre = r.top + r.height / 2 - vh / 2;
      el.style.transform = `translate3d(0, ${(-centre * depth).toFixed(2)}px, 0)`;
    });

    // velocity skew — capped hard. Above ~3deg it reads as a bug, not a flourish.
    const sk = clamp(scrollState.velocity * 0.07, -3, 3);
    skewEls.forEach((el) => {
      el.style.transform = `skewY(${sk.toFixed(3)}deg)`;
    });
  });
}

// ---------------------------------------------------------------------------
// 3. nav + rail instrumentation
// ---------------------------------------------------------------------------
export function initChrome() {
  const nav      = $('.nav');
  const links    = $$('.nav__link, .subnav a');
  const sections = $$('section[id]');
  const railCode = $('[data-rail-code]');
  const railPct  = $('[data-rail-pct]');
  const railClock = $('[data-rail-clock]');
  const ticksWrap = $('.rail__ticks');
  const toTop    = $('.totop');

  // rail ticks: one per section
  if (ticksWrap) {
    sections.forEach(() => {
      const t = document.createElement('span');
      t.className = 'rail__tick';
      ticksWrap.appendChild(t);
    });
  }
  const ticks = $$('.rail__tick');

  // Section numbers are generated from document order, in the nav, the compact
  // subnav and every SEC.xx heading. Inserting a section no longer means
  // renumbering six places by hand and missing one.
  const index = new Map(sections.map((s, i) => [s.id, pad(i + 1)]));
  links.forEach((l) => {
    const id = (l.getAttribute('href') || '').slice(1);
    const n = index.get(id);
    if (!n) return;
    const tag = l.querySelector('i');
    if (tag) tag.textContent = n;
    else l.textContent = `${n} ${l.textContent.replace(/^\d+\s+/, '')}`;
  });
  sections.forEach((s, i) => {
    const code = s.querySelector('.sec-head__code');
    if (!code) return;
    const name = s.dataset.name || s.id.toUpperCase();
    code.textContent = `SEC.${pad(i + 1)} / ${name}`;
    code.dataset.text = code.textContent;      // the scramble effect reads this
  });

  const clock = () => {
    if (!railClock) return;
    const d = new Date();
    railClock.textContent =
      `IST ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  clock();
  setInterval(clock, 1000);

  let frame = 0;
  onTick(() => {
    if (frame++ % 3) return;   // chrome does not need 60fps

    if (nav) nav.classList.toggle('is-stuck', scrollState.y > 40);
    if (toTop) toTop.classList.toggle('is-on', scrollState.y > window.innerHeight);
    if (railPct) railPct.textContent = `${pad(Math.round(scrollState.progress * 100), 3)}%`;

    // which section owns the viewport centre
    const mid = window.innerHeight * 0.42;
    let active = 0;
    sections.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (r.top <= mid) active = i;
    });

    ticks.forEach((t, i) => t.classList.toggle('is-on', i === active));
    links.forEach((l) => {
      l.classList.toggle('is-active', l.getAttribute('href') === `#${sections[active]?.id}`);
    });

    if (railCode && sections[active]) {
      const s = sections[active];
      railCode.innerHTML =
        `<b>SEC.${pad(active + 1)}</b> &nbsp;/&nbsp; ${s.dataset.name || s.id.toUpperCase()}`;
    }
  });

  if (toTop) {
    toTop.addEventListener('click', () =>
      window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }));
  }
}

// ---------------------------------------------------------------------------
// 4. pinned thesis — the slow section
// ---------------------------------------------------------------------------
export function initPin() {
  const pin = $('.pin');
  if (!pin || reduced()) return;

  const lines = $$('.pin__line', pin);
  const bar   = $('.pin__progress i', pin);
  const stage = $('.pin__stage', pin);
  if (!lines.length) return;

  let current = -1;
  let unpinned = false;

  onTick(() => {
    const r = pin.getBoundingClientRect();
    const travel = pin.offsetHeight - window.innerHeight;
    if (travel <= 0) return;

    const p = clamp(-r.top / travel);

    // Sticky can be defeated silently — an ancestor that has quietly become a
    // scroll container is enough. If the stage is not holding near the top
    // while we are in the middle of the pin, stop pretending: unpin, and show
    // every line at once. A visitor must never meet a blank screen because a
    // layout trick did not take.
    if (!unpinned && stage && p > 0.12 && p < 0.88) {
      if (Math.abs(stage.getBoundingClientRect().top) > 80) {
        unpinned = true;
        pin.classList.add('is-unpinned');
        lines.forEach((l) => l.classList.remove('is-past'));
        return;
      }
    }
    if (unpinned) return;
    if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;

    // hold the first and last line a little longer than the middle ones
    const eased = clamp(map(p, 0.06, 0.94, 0, 1));
    const idx = clamp(Math.floor(eased * lines.length), 0, lines.length - 1);

    if (idx !== current) {
      current = idx;
      lines.forEach((l, i) => {
        l.classList.toggle('is-on', i === idx);
        l.classList.toggle('is-past', i < idx);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// 5. timeline spine — fills as it passes the read line
// ---------------------------------------------------------------------------
export function initTimeline() {
  const tl = $('.tl');
  if (!tl) return;
  const fill  = $('.tl__spine i', tl);
  const items = $$('.tl__item', tl);

  onTick(() => {
    const r = tl.getBoundingClientRect();
    const line = window.innerHeight * 0.55;
    const p = clamp((line - r.top) / r.height);
    if (fill) fill.style.transform = `scaleY(${p.toFixed(4)})`;

    items.forEach((it) => {
      const ir = it.getBoundingClientRect();
      it.classList.toggle('is-lit', ir.top < line);
    });
  });
}

// ---------------------------------------------------------------------------
// 6. anchor scrolling that accounts for the sticky nav
// ---------------------------------------------------------------------------
export function initAnchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const top = target.getBoundingClientRect().top + window.scrollY - 68;
    window.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
    // move focus too — otherwise the skip link and nav are decoration for
    // keyboard and screen-reader users
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  });
}
