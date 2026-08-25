// ---------------------------------------------------------------------------
// instruments.js — three small instruments, one file:
//
//   run-hours odometer   real tenure as a machine hour-meter, live
//   annunciator wall     achievements as an ISA-18.2 alarm panel with ACK
//   self-telemetry HUD   the page's own vitals: fps, long tasks, network
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, $$, escapeHtml, onTick, reduced } from './utils.js';

// ---------------------------------------------------------------------------
// 1. RUN-HOURS ODOMETER
//    Hours since experience_start, ticking live. 0.1 h = 6 min, so anyone
//    reading for a while sees the last digit move — tenure as a measurement.
// ---------------------------------------------------------------------------
export function initOdometer() {
  const host = $('[data-odometer]');
  if (!host) return;

  const [y, m] = DATA.availability.start.split('-').map(Number);
  const t0 = new Date(y, m - 1, 1).getTime();

  const hours = () => (Date.now() - t0) / 3.6e6;

  function render() {
    const h = hours();
    const whole = Math.floor(h);
    const tenth = Math.floor((h % 1) * 10);
    const digits = String(whole).padStart(5, '0').split('');

    host.innerHTML =
      digits.map((d) => `<span class="odo__d">${d}</span>`).join('') +
      `<span class="odo__d odo__d--dec">${tenth}</span>`;
  }

  render();
  host.setAttribute('title', `Hours in production AI since ${DATA.availability.start}`);
  // one repaint a minute keeps the decimal honest without costing anything
  setInterval(render, 60_000);
}

// ---------------------------------------------------------------------------
// 2. ANNUNCIATOR WALL
//    Achievements and certifications as annunciator tiles. Unacknowledged
//    tiles flash slowly; clicking one steadies it and stamps the ACK time.
//    ACK state persists per visitor — the wall remembers being read.
// ---------------------------------------------------------------------------
const ACK_KEY = 'sc-acks';

export function initAnnunciator() {
  const host = $('[data-annunciator]');
  if (!host) return;

  const tiles = [
    ...DATA.achievements.slice(0, 2).map((t, i) => ({
      id: `ACH-${i + 1}`, kind: 'AWARD', text: t,
    })),
    ...DATA.certs.slice(0, 6).map((c, i) => ({
      id: `CRT-${i + 1}`, kind: 'CERT',
      text: `${c.name} — ${c.issuer}, ${c.date}`,
      url: c.url, ref: c.id,
    })),
  ];

  let acks = {};
  try { acks = JSON.parse(localStorage.getItem(ACK_KEY) || '{}'); } catch { /* ignore */ }

  host.innerHTML = tiles.map((t) => `
    <button class="ann ${acks[t.id] ? 'is-acked' : ''}" data-ann="${t.id}"
            aria-pressed="${Boolean(acks[t.id])}">
      <span class="ann__head">
        <span class="label">${t.id} · ${t.kind}</span>
        <span class="ann__stamp label" data-ann-stamp>${acks[t.id] ? `ACK ${acks[t.id]}` : 'UNACK'}</span>
      </span>
      <span class="ann__text">${escapeHtml(t.text)}</span>
      ${t.url ? `<span class="ann__verify label">ID ${escapeHtml(t.ref || '')}</span>` : ''}
    </button>`).join('') +
    `<button class="ann ann--all" data-ann="__all">
       <span class="ann__text display" style="font-size:0.95rem">ACK ALL</span>
     </button>`;

  const stamp = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  function ack(tile) {
    const id = tile.dataset.ann;
    const t = stamp();
    acks[id] = t;
    tile.classList.add('is-acked');
    tile.setAttribute('aria-pressed', 'true');
    const s = tile.querySelector('[data-ann-stamp]');
    if (s) s.textContent = `ACK ${t}`;
  }

  host.addEventListener('click', (e) => {
    const tile = e.target.closest('[data-ann]');
    if (!tile) return;

    if (tile.dataset.ann === '__all') {
      $$('[data-ann]', host).forEach((el) => {
        if (el.dataset.ann !== '__all' && !el.classList.contains('is-acked')) ack(el);
      });
    } else if (!tile.classList.contains('is-acked')) {
      ack(tile);
    } else {
      // an acked cert tile opens its verification page
      const t = tiles.find((x) => x.id === tile.dataset.ann);
      if (t?.url) window.open(t.url, '_blank', 'noopener');
      return;
    }
    try { localStorage.setItem(ACK_KEY, JSON.stringify(acks)); } catch { /* ignore */ }
  });
}

// ---------------------------------------------------------------------------
// 3. SELF-TELEMETRY HUD
//    The page reports its own vitals the way its subject monitors production:
//    frame rate (EMA), long tasks, DOM size — and runtime transfer, which is
//    measured rather than claimed. It reads a few hundred bytes when the visit
//    counter reports in, and zero after that, because nothing else on this
//    page talks to the network.
// ---------------------------------------------------------------------------
export function initSelfTelemetry() {
  const host = $('[data-selftel]');
  if (!host) return;

  host.innerHTML = `
    <div class="stat"><div class="stat__v" data-tel="fps">—</div><div class="label">Scan rate</div></div>
    <div class="stat"><div class="stat__v" data-tel="long">0</div><div class="label">Long tasks</div></div>
    <div class="stat"><div class="stat__v" data-tel="dom">—</div><div class="label">DOM nodes</div></div>
    <div class="stat"><div class="stat__v" data-tel="net">0 B</div><div class="label">Runtime transfer</div></div>
    <div class="stat"><div class="stat__v" data-tel="dwell">0:00</div><div class="label">Time on page</div></div>`;

  const elFps  = $('[data-tel="fps"]', host);
  const elLong = $('[data-tel="long"]', host);
  const elDom  = $('[data-tel="dom"]', host);
  const elNet  = $('[data-tel="net"]', host);
  const elDwell = $('[data-tel="dwell"]', host);

  // Time on page, counting only while the tab is actually in front — a
  // backgrounded tab is not a reader.
  const dwell = { ms: 0, since: document.hidden ? 0 : performance.now() };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (dwell.since) dwell.ms += performance.now() - dwell.since;
      dwell.since = 0;
    } else {
      dwell.since = performance.now();
    }
  });
  const dwellSeconds = () =>
    Math.floor((dwell.ms + (dwell.since ? performance.now() - dwell.since : 0)) / 1000);
  const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // long tasks --------------------------------------------------------------
  let longCount = 0;
  try {
    new PerformanceObserver((list) => {
      longCount += list.getEntries().length;
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* unsupported — the readout just stays at 0 */ }

  // runtime transfer: resources fetched after this instrument arms ----------
  const armed = performance.now();
  function runtimeBytes() {
    return performance.getEntriesByType('resource')
      .filter((r) => r.startTime > armed)
      .reduce((n, r) => n + (r.transferSize || 0), 0);
  }
  const fmt = (b) => b === 0 ? '0 B'
    : b < 1024 ? `${b} B`
    : b < 1048576 ? `${(b / 1024).toFixed(1)} KB`
    : `${(b / 1048576).toFixed(1)} MB`;

  // frame rate: EMA of rAF deltas -------------------------------------------
  let ema = 16.7, prev = 0;

  if (reduced()) {
    elFps.textContent = 'static';
    elDom.textContent = String(document.getElementsByTagName('*').length);
    setInterval(() => { elDwell.textContent = clockText(dwellSeconds()); }, 1000);
    return;
  }

  let lastPaint = 0;
  onTick((now) => {
    if (prev) ema = ema * 0.95 + (now - prev) * 0.05;
    prev = now;

    if (now - lastPaint < 1000) return;
    lastPaint = now;
    elFps.textContent = `${Math.round(1000 / ema)} Hz`;
    elLong.textContent = String(longCount);
    elDom.textContent = String(document.getElementsByTagName('*').length);
    elNet.textContent = fmt(runtimeBytes());
    elDwell.textContent = clockText(dwellSeconds());
  });

  // expose it so the visit counter can report the bucket on the way out
  window.__scDwell = dwellSeconds;
}

export function initInstruments() {
  initOdometer();
  initAnnunciator();
  initSelfTelemetry();
}
