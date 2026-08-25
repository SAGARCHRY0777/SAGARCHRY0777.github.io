// ---------------------------------------------------------------------------
// render.js — builds every data-driven region of the page from DATA.
// index.html holds structure and copy; everything factual is injected here so
// profile.json stays the only place a fact is ever edited.
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, $$, escapeHtml, pad } from './utils.js';

// Presentation order — impact first, not the order they appear in the profile.
const ORDER = [
  'Engine Test-Bed',
  'Inferno',
  '3D Object Detection',
  'Foot Monitoring',
  'Distributed Multi-Sensor',
  'Multi-Vendor Camera',
  'Sales Trend',
  'Disaster Tweet',
  'Customer Churn',
];

/**
 * Months since he started at Deevia (Apr 2025). Computed at load, so the
 * number on the page is right tomorrow without anyone editing anything.
 */
export function experienceMonths() {
  const [y, m] = DATA.availability.start.split('-').map(Number);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m));
}

export function experienceText() {
  const n = experienceMonths();
  const yr = Math.floor(n / 12);
  const mo = n % 12;
  if (!yr) return `${mo} mo`;
  return mo ? `${yr} yr ${mo} mo` : `${yr} yr`;
}

const rank = (name) => {
  const i = ORDER.findIndex((k) => name.includes(k));
  return i === -1 ? 99 : i;
};

export const systemsInOrder = () =>
  [...DATA.systems].sort((a, b) => rank(a.name) - rank(b.name));

// ---------------------------------------------------------------------------
export function renderReadouts() {
  const host = $('[data-readouts]');
  if (!host) return;
  host.innerHTML = DATA.readouts.map((r, i) => {
    const value = r.live === 'experience_months' ? String(experienceMonths()) : r.v;
    return `
    <div class="readout" data-reveal="rise" style="--rv-delay:${i * 90}ms">
      <div class="readout__v"><span data-roll="${escapeHtml(value)}">0</span>${
        r.u ? `<small>${escapeHtml(r.u)}</small>` : ''
      }</div>
      <div class="readout__k label">${escapeHtml(r.k)}</div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
export function renderSystems() {
  const host = $('[data-systems]');
  if (!host) return;

  host.innerHTML = systemsInOrder().map((s, i) => {
    const ctx = s.kind === 'work'
      ? `${s.org} · ${s.dates}`
      : 'Independent system';

    const links = (s.links || []).map((l) =>
      `<a class="link-out" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.text)} ↗</a>`
    ).join('') + ((s.links || []).some((l) => /onrender/.test(l.url))
      ? '<span class="label" style="width:100%">Free-tier host — the demo sleeps between visits and takes ~30 s to wake.</span>'
      : '');

    return `
    <article class="sys" data-sys data-tags="${escapeHtml(s.tags.join(' '))}" data-reveal="rise" style="--rv-delay:${Math.min(i, 5) * 70}ms">
      <span class="sys__glow" aria-hidden="true"></span>
      <button class="sys__head" data-sys-toggle aria-expanded="false" aria-controls="sys-body-${i}">
        <span class="sys__no">SYS.${pad(i + 1)}</span>
        <span>
          <span class="sys__name">${escapeHtml(s.name)}</span>
          <span class="sys__ctx">${escapeHtml(ctx)}</span>
        </span>
        <span class="sys__tags">
          ${s.tags.map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join('')}
        </span>
        <span class="sys__toggle" aria-hidden="true"></span>
      </button>
      <div class="sys__body" id="sys-body-${i}">
        <div>
          <div class="sys__inner">
            <span class="sys__spacer"></span>
            <div class="sys__points">
              ${s.points.map((p) => `<p class="sys__point" data-tags="${escapeHtml(p.tags.join(' '))}" data-w="${p.w}"><span>${escapeHtml(p.t)}</span></p>`).join('')}
              ${links ? `<div class="sys__links">${links}</div>` : ''}
            </div>
            <div>
              <p class="label" style="margin-bottom:var(--s-3)">Stack</p>
              <p class="sys__stack">${s.stack.map(escapeHtml).join(' · ')}</p>
            </div>
          </div>
        </div>
      </div>
    </article>`;
  }).join('');

  // expand / collapse
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sys-toggle]');
    if (!btn) return;
    const card = btn.closest('[data-sys]');
    const open = card.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(open));
  });
}

// ---------------------------------------------------------------------------
export function renderCaps() {
  const host = $('[data-caps]');
  if (!host) return;
  host.innerHTML = DATA.caps.map((c, i) => `
    <section class="cap" data-tilt="6" data-reveal="lift" style="--rv-delay:${Math.min(i, 5) * 80}ms">
      <header class="cap__head">
        <h3 class="h3">${escapeHtml(c.label)}</h3>
        <span class="label">${pad(c.items.length)}</span>
      </header>
      <div class="cap__items">
        ${c.items.map((s) => `<span class="skill" data-skill="${escapeHtml(s.toLowerCase())}">${escapeHtml(s)}</span>`).join('')}
      </div>
    </section>`).join('');
}

// ---------------------------------------------------------------------------
export function renderTimeline() {
  const host = $('[data-timeline]');
  if (!host) return;
  host.innerHTML = `
    <span class="tl__spine" aria-hidden="true"><i></i></span>
    ${DATA.timeline.map((t) => `
      <div class="tl__item">
        <span class="tl__dot" aria-hidden="true"></span>
        <p class="tl__when label">${escapeHtml(t.when)}</p>
        <h3 class="tl__what">${escapeHtml(t.what)}</h3>
        <p class="tl__note">${escapeHtml(t.note)}</p>
      </div>`).join('')}
  `;
}

// ---------------------------------------------------------------------------
export function renderMarquees() {
  const a = $('[data-marquee="tech"]');
  const b = $('[data-marquee="domain"]');

  if (a) {
    const tech = ['PyTorch', 'LangGraph', 'FastAPI', 'Redis Streams', 'Kubernetes',
      'ONNX Runtime', 'PostgreSQL', 'LSTM', 'YOLOv8', 'ChromaDB', 'Go',
      'WebSockets', 'Prometheus', 'OpenTelemetry', 'Docker', 'KEDA'];
    a.innerHTML = tech.map((t) => `<span class="marquee__item">${escapeHtml(t)}</span>`).join('');
  }
  if (b) {
    const domain = ['IT-OT pipelines', 'Predictive maintenance', 'Anomaly detection',
      'Sensor fusion', 'RAG over technical reports', 'Agentic workflows',
      'Model serving at scale', 'Industry 4.0'];
    b.innerHTML = domain.map((t) => `<span class="marquee__item">${escapeHtml(t)}</span>`).join('');
  }
}

// ---------------------------------------------------------------------------
export function renderContact() {
  const host = $('[data-contact]');
  if (!host) return;
  const { identity, links } = DATA;
  const rows = [
    { label: 'Email',    text: identity.email,  href: `mailto:${identity.email}` },
    { label: 'Phone',    text: identity.phone,  href: `tel:${identity.phone.replace(/\s/g, '')}` },
    { label: 'LinkedIn', text: 'sagar-chaudhary777', href: links.linkedin },
    { label: 'GitHub',   text: 'SAGARCHRY0777',      href: links.github },
  ];
  host.innerHTML = rows.map((r) => `
    <a class="contact__link" href="${escapeHtml(r.href)}" ${r.href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''} data-magnet>
      <em style="font-style:normal">${escapeHtml(r.text)}</em>
      <span>${escapeHtml(r.label)} ↗</span>
    </a>`).join('');
}

// ---------------------------------------------------------------------------
export function renderFooterFacts() {
  const certs = $('[data-certs]');
  if (certs) {
    certs.innerHTML = DATA.certs.slice(0, 5).map((c) => `
      <li><a class="link-out" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(c.name)}</a></li>
    `).join('');
  }

  const avail = $('[data-availability]');
  if (avail) {
    const a = DATA.availability;
    avail.innerHTML = `
      <li><span class="label">Notice</span> ${escapeHtml(a.notice_full || a.notice)}</li>
      <li><span class="label">Experience</span> ${escapeHtml(experienceText())} — since ${escapeHtml(startLabel())}</li>
      <li><span class="label">Mode</span> ${escapeHtml(a.mode)}</li>
      <li><span class="label">Base</span> ${escapeHtml(DATA.identity.area)}</li>`;
  }

  $$('[data-notice]').forEach((el) => { el.textContent = DATA.availability.notice; });
  const cnt = $('[data-resume-count]');
  if (cnt) cnt.textContent = String(RESUMES.length);

  const y = $('[data-year]');
  if (y) y.textContent = String(new Date().getFullYear());
}

export function renderAll() {
  renderReadouts();
  renderPortrait();
  renderDownloads();
  renderSystems();
  renderCaps();
  renderTimeline();
  renderMarquees();
  renderContact();
  renderFooterFacts();
}

// ---------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startLabel() {
  const [y, m] = DATA.availability.start.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// ---------------------------------------------------------------------------
// The six resume variants. The MATCH console highlights whichever one it
// recommends, so the download and the analysis never disagree.
// ---------------------------------------------------------------------------
export const RESUMES = [
  { key: 'master',     label: 'Master',     note: 'general AI engineer',        file: 'Sagar_Chaudhary_Master.pdf' },
  { key: 'industrial', label: 'Industrial', note: 'IT-OT, IIoT, maintenance',   file: 'Sagar_Chaudhary_Industrial.pdf' },
  { key: 'genai',      label: 'GenAI',      note: 'RAG, agents, LLM systems',   file: 'Sagar_Chaudhary_GenAI.pdf' },
  { key: 'cv',         label: 'Perception', note: 'CV, ADAS, sensor fusion',    file: 'Sagar_Chaudhary_CV.pdf' },
  { key: 'mlops',      label: 'MLOps',      note: 'platform, serving, scale',   file: 'Sagar_Chaudhary_MLOps.pdf' },
  { key: 'backend',    label: 'Backend',    note: 'distributed systems, Go',    file: 'Sagar_Chaudhary_Backend.pdf' },
];

export function renderDownloads() {
  const host = $('[data-downloads]');
  if (!host) return;
  host.innerHTML = RESUMES.map((r) => `
    <a class="dl__row" data-variant="${r.key}" href="assets/docs/${r.file}" download>
      <b>PDF</b>
      <span>${escapeHtml(r.label)} — ${escapeHtml(r.note)}</span>
      <span>↓</span>
    </a>`).join('');
}

/** Called by the matcher so the recommended variant lights up in the list. */
export function highlightVariant(key) {
  $$('[data-variant]').forEach((el) =>
    el.classList.toggle('is-pick', el.dataset.variant === key));
}

export function renderPortrait() {
  const host = $('[data-portrait]');
  if (!host) return;
  host.innerHTML = `
    <img src="assets/img/portrait.jpg" width="716" height="1060" loading="lazy" decoding="async"
         alt="Sagar Chaudhary">
    <span class="portrait__tone" aria-hidden="true"></span>
    <span class="portrait__lines" aria-hidden="true"></span>
    <span class="portrait__tag">Bengaluru · hover to release</span>`;
}

/**
 * Artifact build only. A sandboxed viewer cannot start a file download, so a
 * PDF link there would look live and do nothing. Point at the repo instead.
 */
export function renderDownloadsNotice() {
  const host = $('[data-downloads]');
  if (!host) return;
  host.innerHTML = RESUMES.map((r) => `
    <span class="dl__row" data-variant="${r.key}">
      <b>PDF</b>
      <span>${escapeHtml(r.label)} — ${escapeHtml(r.note)}</span>
      <span>·</span>
    </span>`).join('') +
    `<p class="note" style="margin-top:var(--s-3)">
       Downloads are disabled in this preview. The PDFs ship with the deployed site.
     </p>`;
}
