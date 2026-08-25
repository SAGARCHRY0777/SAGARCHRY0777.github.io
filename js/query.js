// ---------------------------------------------------------------------------
// query.js — the QUERY console.
//
// Ask a question; it retrieves from the fact corpus compiled out of
// profile.json and answers with the source named. TF-IDF over 68 grounded
// facts, no generation step — so it cannot invent an answer. If nothing
// scores above the floor it says so instead of guessing, which is the
// behaviour the hosted version keeps when a model is put behind it.
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, $$, escapeHtml, reduced } from './utils.js';

// Generic verbs matter here as much as articles do. In a corpus of only 68
// facts a bland word like "handle" can be rarer than "backpressure", and IDF
// alone will then rank the wrong bullet first. Ordinary language goes out.
const STOP = new Set(`a an and are as at be by can did do does for from has have how
i in is it its of on or that the to was what when where which who why with you your
he his him tell me about could would should any some there
handle handles handled handling manage managed managing deal dealing done
build built building make made get got give given show shows tell explain
describe approach approaches way ways thing things stuff kind sort
good better best much many more most also well really actually very
experience experienced know knows knowledge worked working work`.split(/\s+/));

const tok = (s) => (s.toLowerCase().match(/[a-z0-9][a-z0-9+.#-]*/g) || [])
  .filter((t) => t.length > 1 && !STOP.has(t));

// ---- index -----------------------------------------------------------------
const DOCS = DATA.facts.map((f) => ({ ...f, tokens: tok(`${f.t} ${f.src} ${f.tags.join(' ')}`) }));
const DF = new Map();
DOCS.forEach((d) => new Set(d.tokens).forEach((t) => DF.set(t, (DF.get(t) || 0) + 1)));
const IDF = (t) => Math.log(1 + DOCS.length / (1 + (DF.get(t) || 0)));

export function retrieve(question, k = 3) {
  const q = tok(question);
  if (!q.length) return [];

  const scored = DOCS.map((d) => {
    const tf = new Map();
    d.tokens.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    let s = 0;
    let exact = 0;      // how many query terms matched a whole token
    let rarest = 0;     // IDF of the rarest term that matched

    q.forEach((t) => {
      if (tf.has(t)) {
        // exact matches are weighted super-linearly in IDF, so one rare term
        // ("backpressure") beats several common ones ("handle", "data")
        s += Math.pow(IDF(t), 1.7) * (1 + Math.log(tf.get(t)));
        exact++;
        rarest = Math.max(rarest, IDF(t));
      } else if (t.length > 4 && d.tokens.some((dt) => dt.startsWith(t.slice(0, 5)))) {
        s += IDF(t) * 0.15;   // prefix credit only, deliberately small
      }
    });

    // gentle length normalisation — full normalisation buries the long,
    // detailed bullets, which are exactly the good answers
    return { doc: d, score: s / (1 + 0.28 * Math.sqrt(d.tokens.length)), exact, rarest };
  });

  // A result must land at least one exact term that is not commonplace.
  // Without this floor the console answers questions it has no answer to.
  return scored
    .filter((r) => r.exact > 0 && r.rarest > 2.2 && r.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ---------------------------------------------------------------------------
export function initQuery() {
  const input = $('[data-q-input]');
  const run   = $('[data-q-run]');
  const out   = $('[data-q-out]');
  const src   = $('[data-q-src]');
  if (!input || !out) return;

  let typing = null;

  function type(text) {
    clearInterval(typing);
    if (reduced()) { out.textContent = text; out.classList.remove('caret'); return; }
    out.textContent = '';
    out.classList.add('caret');
    let i = 0;
    typing = setInterval(() => {
      // 3 chars a tick reads as a terminal, 1 reads as slow
      i = Math.min(text.length, i + 3);
      out.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(typing); out.classList.remove('caret'); }
    }, 16);
  }

  function ask(question) {
    const hits = retrieve(question);
    src.innerHTML = '';

    if (!hits.length) {
      type(`Nothing in the profile answers that. The corpus is 68 grounded facts compiled from profile.json — if it is not in there, this console will not make something up. Try asking about IT-OT pipelines, LSTM forecasting, RAG, LiDAR fusion, model serving, notice period or expected compensation.`);
      return;
    }

    type(hits[0].doc.t);

    src.innerHTML = `<span class="label">Source</span>` +
      hits.map((h) => `<span class="tag is-hit">${escapeHtml(h.doc.src)}</span>`).join('') +
      (hits.length > 1
        ? `<span class="label" style="width:100%;margin-top:var(--s-2)">Also relevant</span>` +
          hits.slice(1).map((h) => `<span class="mono dim" style="width:100%">— ${escapeHtml(h.doc.t)}</span>`).join('')
        : '');
  }

  run?.addEventListener('click', () => ask(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ask(input.value); }
  });

  $$('[data-q-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = (btn.dataset.text || btn.textContent).trim();
      ask(input.value);
    });
  });
}
