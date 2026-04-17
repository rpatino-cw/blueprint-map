#!/usr/bin/env node
// Baseline capture — measurable goals for speed + accuracy.
// Writes test/baseline.json with per-fixture timing (median of 5) and hierarchy counts.
// Also runs the hall-matching regression so one file has both dimensions.
// Compare future runs with: node test/check-baseline.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function parseOnce(grid) {
  const parser = vm.runInContext('new LayoutParser(grid)', Object.assign(ctx, { grid }));
  return parser.parse();
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function summarizeHierarchy(result) {
  const halls = result.halls || [];
  let grids = 0, pods = 0, sections = 0, autoPods = 0;
  for (const h of halls) {
    for (const g of (h.grids || [])) {
      grids++;
      for (const p of (g.pods || [])) {
        pods++;
        sections += (p.sections || []).length;
        for (const s of (p.sections || [])) if (s.autoPod) autoPods++;
      }
    }
  }
  return {
    hallCount: halls.length,
    hallNames: halls.map(h => h.name),
    gridCount: grids,
    podCount: pods,
    sectionCount: sections,
    autoPodSections: autoPods,
    totalRacks: result.totalRacks || 0,
    blockCount: (result.blocks || []).length,
    warnings: (result.warnings || []).length,
  };
}

const fixtures = fs.readdirSync(path.join(__dirname, 'fixtures'))
  .filter(f => f.endsWith('.csv'))
  .sort();

console.log(`Capturing baseline for ${fixtures.length} fixtures (median of 5 runs each)…\n`);

const baseline = {
  generated: new Date().toISOString(),
  node: process.version,
  parserSize: fs.statSync(path.join(jsDir, 'parser.js')).size,
  fixtures: {},
  summary: {},
};

for (const fixture of fixtures) {
  const grid = loadCSV(fixture);
  const rows = grid.length;
  const cols = Math.max(...grid.map(r => r.length));

  for (let i = 0; i < 3; i++) parseOnce(grid);
  const runs = [];
  let lastResult;
  for (let i = 0; i < 7; i++) {
    const t0 = process.hrtime.bigint();
    lastResult = parseOnce(grid);
    const t1 = process.hrtime.bigint();
    runs.push(Number(t1 - t0) / 1e6);
  }

  const h = summarizeHierarchy(lastResult);
  const timing = lastResult.timing || {};

  baseline.fixtures[fixture] = {
    size: { rows, cols, cells: rows * cols },
    timing: {
      totalMs: +median(runs).toFixed(2),
      p95Ms: +runs.sort((a, b) => a - b)[Math.min(runs.length - 1, 6)].toFixed(2),
      perPassMs: Object.fromEntries(
        Object.entries(timing).filter(([k]) => k !== 'total')
      ),
    },
    hierarchy: h,
  };

  console.log(
    `${fixture.padEnd(26)} ${rows}×${cols}`.padEnd(40) +
    `  ${baseline.fixtures[fixture].timing.totalMs}ms`.padEnd(10) +
    `  halls=${h.hallCount} pods=${h.podCount} sections=${h.sectionCount} racks=${h.totalRacks}`
  );
}

const all = Object.values(baseline.fixtures);
baseline.summary = {
  totalMs: +all.reduce((s, f) => s + f.timing.totalMs, 0).toFixed(2),
  totalCells: all.reduce((s, f) => s + f.size.cells, 0),
  totalRacks: all.reduce((s, f) => s + f.hierarchy.totalRacks, 0),
  totalSections: all.reduce((s, f) => s + f.hierarchy.sectionCount, 0),
  totalPods: all.reduce((s, f) => s + f.hierarchy.podCount, 0),
  totalHalls: all.reduce((s, f) => s + f.hierarchy.hallCount, 0),
};

const scorecardPath = path.join(__dirname, 'regression', 'scorecard.json');
if (fs.existsSync(scorecardPath)) {
  try {
    const sc = JSON.parse(fs.readFileSync(scorecardPath, 'utf8'));
    let hallsTotal = 0, hallsPass = 0, racksExpected = 0, racksMatched = 0;
    for (const site of sc.sites || []) {
      for (const hall of site.halls || []) {
        hallsTotal++;
        if (hall.status === 'PASS') hallsPass++;
        racksExpected += hall.expected_racks || 0;
        racksMatched += hall.found_racks || 0;
      }
    }
    baseline.accuracy = {
      generated: sc.generated,
      hallsPass, hallsTotal,
      hallsPassPct: hallsTotal ? +(100 * hallsPass / hallsTotal).toFixed(1) : 0,
      racksExpected, racksMatched,
      racksMatchedPct: racksExpected ? +(100 * racksMatched / racksExpected).toFixed(1) : 0,
    };
  } catch (_) {}
}

const out = path.join(__dirname, 'baseline.json');
fs.writeFileSync(out, JSON.stringify(baseline, null, 2));
console.log(`\nWrote ${out}`);
console.log(`Total parse time (all fixtures, median): ${baseline.summary.totalMs} ms`);
console.log(`Total racks: ${baseline.summary.totalRacks} across ${baseline.summary.totalPods} pods in ${baseline.summary.totalHalls} halls`);
if (baseline.accuracy) {
  const a = baseline.accuracy;
  console.log(`Hall matching: ${a.hallsPass}/${a.hallsTotal} (${a.hallsPassPct}%)`);
  console.log(`Rack matching: ${a.racksMatched}/${a.racksExpected} (${a.racksMatchedPct}%)`);
}
