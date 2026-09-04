const base = process.env.PERF_API_BASE ?? "http://127.0.0.1:4000/api/v1";
const iterations = Number(process.env.PERF_ITERATIONS ?? 50);
const targetMs = Number(process.env.PERF_P95_TARGET_MS ?? 2000);
const queries = [
  '"المال العام"',
  "الزكاة الفقراء",
  "الضريبة -الجمارك",
  "قانون رقم 14 لسنة 1990",
  "صرف اعتماد",
];

async function request(query) {
  const url = new URL(`${base}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("pageSize", "20");
  const started = performance.now();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Search returned HTTP ${response.status}`);
  await response.arrayBuffer();
  return performance.now() - started;
}

for (const query of queries) await request(query);
const samples = [];
for (let index = 0; index < iterations; index += 1) {
  samples.push(await request(queries[index % queries.length]));
}
samples.sort((left, right) => left - right);
const percentile = samples[Math.ceil(samples.length * 0.95) - 1] ?? Infinity;
const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
console.log(
  JSON.stringify(
    {
      iterations,
      averageMs: Number(average.toFixed(2)),
      p95Ms: Number(percentile.toFixed(2)),
      maxMs: Number((samples.at(-1) ?? 0).toFixed(2)),
      targetMs,
      passed: percentile <= targetMs,
    },
    null,
    2,
  ),
);
if (percentile > targetMs) process.exitCode = 1;
