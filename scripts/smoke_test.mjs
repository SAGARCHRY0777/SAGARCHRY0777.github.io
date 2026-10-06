// minimal DOM stub so the pure logic can be exercised in node
const mq = { matches: false, addEventListener() {} };
globalThis.window = { matchMedia: () => mq, addEventListener() {}, innerWidth: 1440, innerHeight: 900, scrollY: 0 };
globalThis.document = {
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, documentElement: { style: {}, getAttribute: () => null, setAttribute() {} },
  readyState: 'complete',
};
globalThis.performance = { now: () => 0 };
globalThis.requestAnimationFrame = () => 0;
globalThis.IntersectionObserver = class { observe(){} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#000000' });

const { scoreJD } = await import('../js/match.js');
const { retrieve } = await import('../js/query.js');
const { DATA } = await import('../js/data.js');

console.log('corpus:', DATA.facts.length, 'facts |', Object.keys(DATA.vocab).length, 'vocab |', DATA.systems.length, 'systems');

const JD_IND = `Senior AI Engineer, industrial analytics. Build IT-OT pipelines ingesting
sensor and telemetry data from PLCs over MQTT and OPC UA. Time series anomaly detection and
forecasting with LSTM. Python, FastAPI, PostgreSQL, Docker, Kubernetes, Kafka, Prometheus.
Industry 4.0 IIoT predictive maintenance. RAG over maintenance reports a plus.`;

const JD_CLOUD = `Data Engineer. Azure Databricks, Spark, Snowflake, dbt, Terraform, Scala,
Airflow, Power BI. Build lakehouse pipelines on GCP and Azure.`;

for (const [name, jd] of [['industrial', JD_IND], ['cloud-data (should score low)', JD_CLOUD]]) {
  const r = scoreJD(jd);
  console.log(`\n-- ${name}`);
  console.log('   score   :', r.score);
  console.log('   variant :', r.variant);
  console.log('   hits    :', r.hits.slice(0, 12).map(h => h[0]).join(', '));
  console.log('   gaps    :', r.gaps.join(', ') || '(none)');
}

console.log('\n-- retrieval');
for (const q of ['What has he built with LangGraph?', 'how does he handle backpressure',
                 'lidar camera fusion accuracy', 'what is his notice period',
                 'do you know Kubernetes autoscaling', 'what about quantum computing']) {
  const hits = retrieve(q, 1);
  console.log(`   "${q}"\n      -> ${hits.length ? hits[0].doc.src + ' :: ' + hits[0].doc.t.slice(0, 90) : 'NO ANSWER (correct if out of scope)'}`);
}

console.log('\n-- retrieval ranking detail: "how does he handle backpressure"');
retrieve('how does he handle backpressure', 4).forEach((h, i) =>
  console.log(`   ${i + 1}. ${h.score.toFixed(3)} exact=${h.exact} rare=${h.rarest.toFixed(2)}  ${h.doc.t.slice(0, 70)}`));
