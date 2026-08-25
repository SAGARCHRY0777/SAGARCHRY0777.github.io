// ---------------------------------------------------------------------------
// match.js — the JD matcher.
//
// Paste a job description; it is tokenised against the technology vocabulary
// compiled out of profile.json, scored for coverage, and the gaps are named
// out loud. Nothing is claimed that is not in the profile: a term he does not
// have shows up as a GAP, never as a match. That rule is the whole point —
// it is the same rule the resume pipeline runs under.
//
// This runs entirely in the browser. No model call, no network.
// ---------------------------------------------------------------------------

import { DATA } from './data.js';
import { $, $$, clamp, escapeHtml } from './utils.js';
import { highlightVariant, RESUMES } from './render.js';
import { throwLane } from './patchbay.js';

/**
 * Terms a job description might reasonably ask for. Membership here only makes
 * a word a CANDIDATE; whether it counts as a match is decided by DATA.vocab.
 */
const LEXICON = [
  'kafka', 'spark', 'flink', 'hadoop', 'airflow', 'dbt', 'snowflake', 'databricks',
  'azure', 'gcp', 'sagemaker', 'vertex ai', 'bedrock', 'terraform', 'ansible',
  'mlflow', 'kubeflow', 'triton', 'tensorrt', 'cuda', 'ray', 'dask',
  'pinecone', 'weaviate', 'milvus', 'qdrant', 'elasticsearch', 'neo4j',
  'rust', 'scala', 'c++', 'java', 'spring', 'kotlin', 'graphql', 'grpc',
  'tableau', 'power bi', 'looker', 'snowpark', 'databricks',
  'opc ua', 'modbus', 'plc', 'scada', 'historian', 'mqtt', 'ignition',
  'kubernetes', 'docker', 'pytorch', 'tensorflow', 'onnx', 'fastapi', 'redis',
  'postgresql', 'mongodb', 'aws', 'langchain', 'langgraph', 'rag', 'mcp',
  'yolo', 'detectron2', 'opencv', 'lstm', 'arima', 'xgboost', 'lightgbm',
  'prometheus', 'opentelemetry', 'websockets', 'microservices', 'go', 'python',
  'react', 'typescript', 'sql', 'nosql', 'ci/cd', 'git', 'linux',
  'anomaly detection', 'predictive maintenance', 'time series', 'forecasting',
  'computer vision', 'sensor fusion', 'lidar', 'nlp', 'transformers', 'bert',
  'prompt engineering', 'embeddings', 'vector database', 'agentic',
  'distributed systems', 'system design', 'event driven', 'pub/sub', 'streaming',
];

// Domain signals decide which of his five resume variants to recommend.
const DOMAIN = {
  industrial: ['industrial', 'manufacturing', 'plant', 'factory', 'ot', 'iiot',
    'iot', 'scada', 'plc', 'sensor', 'telemetry', 'predictive maintenance',
    'test bed', 'testbed', 'engine', 'engines', 'industry 4.0', 'automation', 'machine health'],
  genai: ['llm', 'genai', 'generative', 'rag', 'agent', 'agentic', 'prompt',
    'chatbot', 'langchain', 'langgraph', 'embedding', 'vector', 'mcp', 'openai'],
  cv: ['computer vision', 'perception', 'detection', 'segmentation', 'lidar',
    'camera', 'adas', 'autonomous', 'image', 'video', 'yolo', 'annotation'],
  mlops: ['mlops', 'platform', 'serving', 'inference', 'kubernetes', 'deploy',
    'observability', 'autoscal', 'latency', 'throughput', 'ci/cd', 'sre'],
  backend: ['backend', 'api', 'apis', 'microservice', 'microservices', 'distributed',
    'event driven', 'scalable', 'scalability', 'concurrency', 'golang', 'database',
    'queue', 'broker'],
};
// prefix-style entries above ('autoscal', 'scalab') are matched as whole words
// of any suffix via has() below — see domainHit.

const VARIANT_LABEL = {
  industrial: 'INDUSTRIAL — IT-OT & predictive maintenance',
  genai: 'GENAI — RAG & agentic systems',
  cv: 'CV — perception & ADAS',
  mlops: 'MLOPS — platform & model serving',
  backend: 'BACKEND — distributed systems',
  master: 'MASTER — general AI engineer',
};

// Hyphens are collapsed to spaces on BOTH sides, so a job description asking
// for "time series" matches a profile that says "time-series".
const pdfFor = (key) =>
  (RESUMES.find((v) => v.key === key) || RESUMES[0]).file;

const norm = (s) => s.toLowerCase()
  .replace(/[^a-z0-9+#./ -]/g, ' ')
  .replace(/-/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// normalised lookup: term -> where it is evidenced in the profile
const VOCAB = new Map();
for (const [term, where] of Object.entries(DATA.vocab)) {
  const k = norm(term);
  if (k.length > 1) VOCAB.set(k, where);
}
const ALIASES = new Map(
  Object.entries(DATA.aliases || {}).map(([a, r]) => [norm(a), r ? norm(r) : ''])
);

/** Does `text` contain `term` as a whole phrase? */
function has(text, term) {
  const t = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${t}([^a-z0-9]|$)`, 'i').test(text);
}

export function scoreJD(raw) {
  const text = norm(raw);
  if (text.length < 30) return null;

  // ---- 1. what he has that the JD asks for ------------------------------- #
  const hits = new Map();
  for (const [term, where] of VOCAB) {
    if (has(text, term)) hits.set(term, where);
  }
  // aliases: a JD saying "k8s" is asking for kubernetes
  for (const [alias, real] of ALIASES) {
    if (!real) continue;
    if (has(text, alias) && VOCAB.has(real)) hits.set(real, VOCAB.get(real));
  }

  // ---- 2. what the JD asks for that he does not have --------------------- #
  const gaps = [];
  for (const raw of LEXICON) {
    const term = norm(raw);
    if (!has(text, term)) continue;
    if (VOCAB.has(term) || hits.has(term)) continue;
    const mapped = ALIASES.get(term);
    if (mapped && (VOCAB.has(mapped) || hits.has(mapped))) continue;
    // a term already covered by a longer matched phrase is not a gap
    if ([...hits.keys()].some((h) => h.includes(term))) continue;
    if (!gaps.includes(raw)) gaps.push(raw);
  }

  // ---- 3. domain read ---------------------------------------------------- #
  // whole-word (or word-prefix) matching: 'ot' must not match 'remote',
  // 'engine' must not match 'engineer', 'api' must not match 'rapid'
  const domainHit = (w) => new RegExp(`(^|[^a-z0-9])${norm(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z]*([^a-z0-9]|$)`, 'i').test(text);
  const domainScore = {};
  for (const [key, words] of Object.entries(DOMAIN)) {
    domainScore[key] = words.reduce((n, w) => n + (domainHit(w) ? 1 : 0), 0);
  }
  const ranked = Object.entries(domainScore).sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  // a clear winner only: ties or weak signals fall back to the master resume
  const variant = best[1] >= 2 && best[1] > (ranked[1]?.[1] ?? 0) ? best[0] : 'master';

  // ---- 4. coverage ------------------------------------------------------- #
  const h = hits.size;
  const g = gaps.length;
  const coverage = h + g === 0 ? 0 : h / (h + g);
  // depth bonus: a JD he matches on many distinct terms is a better fit than
  // one he matches on three, even at the same ratio.
  const depth = clamp(h / 14);
  const score = Math.round(clamp(coverage * 0.72 + depth * 0.28) * 100);

  // ---- 5. evidence: real bullets that share the JD's domain -------------- #
  const evidence = DATA.facts
    .filter((f) => f.tags.includes(variant === 'master' ? 'industrial' : variant))
    .slice(0, 3)
    .map((f) => f.t);

  return {
    score,
    variant,
    variantLabel: VARIANT_LABEL[variant],
    hits: [...hits.entries()].sort((a, b) => b[1].length - a[1].length),
    gaps,
    domainScore,
    evidence,
  };
}

// ---------------------------------------------------------------------------
export function initMatch() {
  const input = $('[data-jd-input]');
  const run   = $('[data-jd-run]');
  const out   = $('[data-jd-out]');
  const clear = $('[data-jd-clear]');
  if (!input || !out) return;

  const idle = `<p class="dim mono">Paste a job description and press ANALYSE. Everything is computed locally in this tab.</p>`;
  out.innerHTML = idle;

  function paint(r) {
    if (!r) {
      out.innerHTML = `<p class="dim mono">Not enough text to score. Paste the full description.</p>`;
      return;
    }

    out.innerHTML = `
      <div class="gauge">
        <span class="gauge__v" data-count>0</span>
        <span class="label">/ 100 coverage</span>
        <span class="gauge__bar"><i></i></span>
      </div>

      <div class="kv">
        <div class="kv__row">
          <span class="label">Resume</span>
          <span class="stack" style="gap:var(--s-3)">
            <span class="mono">${escapeHtml(r.variantLabel)}</span>
            <a class="btn btn--primary" style="align-self:start"
               href="assets/docs/${escapeHtml(pdfFor(r.variant))}" download data-magnet>
              <span class="btn__dot"></span><span>Download this variant</span>
            </a>
          </span>
        </div>
        <div class="kv__row">
          <span class="label">Matched</span>
          <span class="sys__tags">${
            r.hits.length
              ? r.hits.slice(0, 26).map(([t]) => `<span class="tag is-hit">${escapeHtml(t)}</span>`).join('')
              : '<span class="dim mono">no vocabulary overlap found</span>'
          }</span>
        </div>
        <div class="kv__row">
          <span class="label">Gaps</span>
          <span class="sys__tags">${
            r.gaps.length
              ? r.gaps.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')
              : '<span class="mono" style="color:var(--nominal)">none detected in this description</span>'
          }</span>
        </div>
        <div class="kv__row">
          <span class="label">Evidence</span>
          <span class="stack" style="gap:var(--s-2)">${
            r.evidence.map((e) => `<span class="mono dim">— ${escapeHtml(e)}</span>`).join('')
          }</span>
        </div>
      </div>

      <p class="note" style="margin-top:var(--s-5)">
        Gaps are printed, not hidden. Anything listed on the right is a term the
        job asks for that is not in the profile — it never gets written onto a
        resume to make the number look better.
      </p>`;

    highlightVariant(r.variant);
    if (r.variant !== 'master') throwLane(r.variant);

    // animate the gauge
    const bar = out.querySelector('.gauge__bar i');
    const num = out.querySelector('[data-count]');
    requestAnimationFrame(() => { bar.style.transform = `scaleX(${(r.score / 100).toFixed(3)})`; });

    const t0 = performance.now();
    const tick = (now) => {
      const p = clamp((now - t0) / 1100);
      const eased = 1 - Math.pow(1 - p, 4);
      num.textContent = Math.round(r.score * eased);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  run?.addEventListener('click', () => paint(scoreJD(input.value)));
  clear?.addEventListener('click', () => { input.value = ''; out.innerHTML = idle; });

  input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') paint(scoreJD(input.value));
  });

  // sample JDs so the console is never empty on a first visit
  $$('[data-jd-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      input.value = SAMPLES[btn.dataset.jdSample] || '';
      paint(scoreJD(input.value));
      input.scrollTop = 0;
    });
  });
}

const SAMPLES = {
  industrial: `Senior AI Engineer — Industrial Analytics
We are building the predictive maintenance platform for our manufacturing plants.
You will design IT-OT data pipelines that ingest high-frequency sensor and telemetry
data from PLCs and historians over MQTT and OPC UA, build time series anomaly
detection and forecasting models (LSTM), and deploy them with Docker and Kubernetes.
Experience with Python, FastAPI, PostgreSQL, streaming architectures, event driven
pub/sub, Kafka and observability (Prometheus) required. Industry 4.0 / IIoT
background strongly preferred. Exposure to RAG or LLM assistants over maintenance
reports is a plus.`,

  genai: `AI Engineer — Generative AI Platform
Own our RAG and agentic stack end to end. Design chunking and embedding strategies,
build retrieval with reranking over a vector database, and ship tool-using agents with
LangChain / LangGraph and MCP. Serve LLMs, evaluate prompts, and deploy on Kubernetes
with CI/CD. Python, FastAPI, Redis, PostgreSQL, Docker. Familiarity with Pinecone or
Weaviate and with Azure OpenAI is a plus.`,

  cv: `Computer Vision Engineer — ADAS Perception
Build perception for autonomous driving: 2D and 3D object detection, LiDAR and camera
sensor fusion, calibration, and segmentation. Strong PyTorch, YOLO, Detectron2, OpenCV.
Experience with KITTI-style datasets, annotation pipelines, monocular depth, and
deploying models with TensorRT or ONNX. C++ experience a plus.`,
};
