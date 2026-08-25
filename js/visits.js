// ---------------------------------------------------------------------------
// visits.js — the visit counter.
//
// ┌───────────────────────────────────────────────────────────────────────┐
// │  SET YOUR GOATCOUNTER CODE HERE. Until it is set, the readout stays   │
// │  hidden and the page makes no network request at all.                 │
// │                                                                       │
// │  1. sign up free at https://www.goatcounter.com  (no card, no cookies)│
// │  2. the code you pick becomes CODE.goatcounter.com — put it below     │
// │  3. in Settings, tick "Allow adding visitor counts on your website"   │
// │     (that is what makes the /counter/TOTAL.json endpoint public)      │
// └───────────────────────────────────────────────────────────────────────┘
const CODE = 'sagarchry0777';

// The readout appears once the total clears this floor. It is set to 1 so the
// count is visible as asked, while never rendering a bare "0", which reads as
// broken rather than as new. Raise it to 25 if a low number starts to look
// worse than no number; set it to 0 to show even a zero.
const MIN_TO_SHOW = 1;

// This is the ONE external request the site makes, and it is deliberate.
// GoatCounter's own script is not loaded — the endpoints are called directly,
// so no third-party JavaScript ever executes here. GoatCounter sets no
// cookies and stores no IP addresses.
// ---------------------------------------------------------------------------

import { $ } from './utils.js';

const origin = (code) => `https://${encodeURIComponent(code)}.goatcounter.com`;

/** Record this visit. Once per browser session, so it counts people, not renders. */
function record(code) {
  try {
    if (sessionStorage.getItem('sc-counted') === '1') return;
    sessionStorage.setItem('sc-counted', '1');
  } catch { /* private mode: count it, we simply cannot dedupe */ }

  const q = new URLSearchParams({
    p: location.pathname || '/',
    t: document.title.slice(0, 120),
    r: document.referrer.slice(0, 300),
  });

  // no-cors: the response is not needed, and this way the request costs
  // nothing to parse and cannot fail loudly
  fetch(`${origin(code)}/count?${q}`, { mode: 'no-cors', keepalive: true })
    .catch(() => { /* offline, blocked, or the service is down — never mind */ });
}

/** Read the running total and print it. */
async function show(code, host) {
  try {
    const res = await fetch(`${origin(code)}/counter/TOTAL.json`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();

    // GoatCounter returns pre-formatted strings, e.g. { count: "1,234" }
    const total = String(data.count ?? '').trim();
    const unique = String(data.count_unique ?? '').trim();
    if (!total) throw new Error('empty');

    // GoatCounter formats with thousands separators, so strip them to compare
    if (Number(total.replace(/[^0-9]/g, '')) < MIN_TO_SHOW) {
      host.hidden = true;
      return;
    }

    host.hidden = false;
    const nEl = $('[data-visits-total]', host);
    const uEl = $('[data-visits-unique]', host);
    if (nEl) nEl.textContent = total;
    if (uEl) uEl.textContent = unique ? `${unique} unique` : '';
  } catch {
    // A counter that shows a wrong number is worse than one that shows none.
    host.hidden = true;
  }
}

/**
 * Report how long the visit lasted, as a GoatCounter EVENT.
 *
 * Aggregate retention is not something GoatCounter measures on its own, so
 * the page reports it: on the way out, the dwell time is put in a coarse
 * bucket and sent as an event. Buckets rather than exact seconds, because a
 * dashboard row per second is noise, and because a coarse figure cannot
 * identify anybody. It rides on `sendBeacon`, which survives the unload that
 * a normal request would not.
 */
function reportDwell(code) {
  const seconds = typeof window.__scDwell === 'function' ? window.__scDwell() : 0;
  if (!seconds) return;

  const bucket =
    seconds < 10   ? 'bounce-under-10s' :
    seconds < 30   ? '10-30s'  :
    seconds < 60   ? '30-60s'  :
    seconds < 180  ? '1-3min'  :
    seconds < 600  ? '3-10min' : 'over-10min';

  const q = new URLSearchParams({ p: `dwell/${bucket}`, e: 'true', t: `Dwell ${bucket}` });
  const url = `${origin(code)}/count?${q}`;
  try {
    if (navigator.sendBeacon) navigator.sendBeacon(url);
    else fetch(url, { mode: 'no-cors', keepalive: true }).catch(() => {});
  } catch { /* the visit still counted; only the duration is lost */ }
}

export function initVisits() {
  const host = $('[data-visits]');
  if (!host) return;

  if (!CODE) {
    host.hidden = true;      // dormant until the code is filled in above
    return;
  }

  record(CODE);
  show(CODE, host);

  // pagehide fires where unload is unreliable (bfcache, mobile Safari);
  // the hidden-visibility path covers tab switches that never come back
  let reported = false;
  const once = () => { if (!reported) { reported = true; reportDwell(CODE); } };
  addEventListener('pagehide', once);
  document.addEventListener('visibilitychange', () => { if (document.hidden) once(); });
}
