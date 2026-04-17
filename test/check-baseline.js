#!/usr/bin/env node
// Guard test — fail the build if parser accuracy or speed regresses vs baseline.json.
// Run after any parser.js change: `node test/check-baseline.js`
// To update the baseline: `node test/capture-baseline.js`

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SPEED_REGRESSION_TOLERANCE = 3.0;
const SPEED_ABSOLUTE_FLOOR_MS = 15;
const WARMUP_RUNS = 3;
const MEASURE_RUNS = 7;
const BASELINE_PATH = path.join(__dirname, 'baseline.json');

if (!fs.existsSync(BASELINE_PATH)) {
  console.error('No baseline.json. Run: node test/capture-baseline.js');
  process.exit(2);
}
const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

const ctx = vm.createContext({
  console,
  performance: { now: () => { const [s, ns] = process.hrtime(); return s * 1000 + ns / 1e6; } },
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
});
const jsDir = path.join(__dirname, '..', 'js');
for (const file of ['type-library.js', 'parser.js', 'netbox-matcher.js']) {
  const src = path.join(jsDir, file);
  if (!fs.existsSync(src)) continue;
  const code = fs.readFileSync(src, 'utf8').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  vm.runInContext(code, ctx, { filename: file });
}

function loadCSV(name) {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  const lines = [];
  let line = '', inQ = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') { inQ = !inQ; line += ch; continue; }
    if (ch === '\r') continue;
    if (ch === '\n' && !inQ) { lines.push(line); line = ''; continue; }
    line += ch;
  }
  if (line) lines.push(line);
  return lines.map(row => {
    const cells = []; let cell = '', q = false;
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '"') { q = !q; continue; }
      if (ch === ',' && !q) { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    return cells;
  });
}

function summarize(result) {
  const halls = result.halls || [];
  let pods = 0, sections = 0;
  for (const h of halls) for (const g of h.grids || []) for (const p of g.pods || []) {
    pods++;
    sections += (p.sections || []).length;
  }
  return {
    hallCount: halls.length,
    podCount: pods,
    sectionCount: sections,
    totalRacks: result.totalRacks || 0,
  };
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const failures = [];
const improvements = [];

for (const [fixture, ref] of Object.entries(baseline.fixtures)) {
  const grid = loadCSV(fixture);
  for (let i = 0; i < WARMUP_RUNS; i++) {
    vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));
  }
  const runs = [];
  let res;
  for (let i = 0; i < MEASURE_RUNS; i++) {
    const t0 = process.hrtime.bigint();
    res = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));
    runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const cur = summarize(res);
  const curMs = median(runs);
  const refH = ref.hierarchy;

  const accuracyProblems = [];
  if (cur.hallCount !== refH.hallCount) accuracyProblems.push(`halls ${refH.hallCount} → ${cur.hallCount}`);
  if (cur.podCount !== refH.podCount) accuracyProblems.push(`pods ${refH.podCount} → ${cur.podCount}`);
  if (cur.sectionCount !== refH.sectionCount) accuracyProblems.push(`sections ${refH.sectionCount} → ${cur.sectionCount}`);
  if (cur.totalRacks !== refH.totalRacks) accuracyProblems.push(`racks ${refH.totalRacks} → ${cur.totalRacks}`);

  const speedBudget = ref.timing.totalMs * SPEED_REGRESSION_TOLERANCE;
  const speedOk = curMs <= speedBudget || curMs <= SPEED_ABSOLUTE_FLOOR_MS;

  if (accuracyProblems.length) {
    failures.push({ fixture, kind: 'accuracy', details: accuracyProblems.join(', ') });
    console.log(`FAIL ${fixture} — accuracy: ${accuracyProblems.join(', ')}`);
  } else if (!speedOk) {
    failures.push({ fixture, kind: 'speed', details: `${curMs.toFixed(2)}ms > budget ${speedBudget.toFixed(2)}ms (baseline ${ref.timing.totalMs}ms)` });
    console.log(`FAIL ${fixture} — speed: ${curMs.toFixed(2)}ms (baseline ${ref.timing.totalMs}ms, +${(((curMs / ref.timing.totalMs) - 1) * 100).toFixed(0)}%)`);
  } else {
    const delta = curMs - ref.timing.totalMs;
    if (delta < -0.3) improvements.push({ fixture, delta: +delta.toFixed(2), from: ref.timing.totalMs, to: +curMs.toFixed(2) });
    console.log(`ok   ${fixture.padEnd(26)} ${curMs.toFixed(2)}ms  halls=${cur.hallCount} pods=${cur.podCount} racks=${cur.totalRacks}`);
  }
}

if (baseline.accuracy) {
  const a = baseline.accuracy;
  console.log(`\nBaseline accuracy lock: halls ${a.hallsPass}/${a.hallsTotal} (${a.hallsPassPct}%), racks ${a.racksMatched}/${a.racksExpected} (${a.racksMatchedPct}%)`);
  console.log(`Re-run regression then capture-baseline to refresh.`);
}
console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'}: ${Object.keys(baseline.fixtures).length - failures.length}/${Object.keys(baseline.fixtures).length} fixtures`);
if (improvements.length) {
  console.log(`\nSpeed improvements vs baseline:`);
  for (const i of improvements.sort((a, b) => a.delta - b.delta)) {
    console.log(`  ${i.fixture.padEnd(26)} ${i.from}ms → ${i.to}ms (${i.delta > 0 ? '+' : ''}${i.delta}ms)`);
  }
  console.log(`\nTip: run 'node test/capture-baseline.js' to lock in the new baseline.`);
}
process.exit(failures.length > 0 ? 1 : 0);
