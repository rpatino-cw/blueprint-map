#!/usr/bin/env node
// Parser benchmark — times each pass on real and synthetic data
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
for (const file of ['type-library.js', 'parser.js']) {
  const code = fs.readFileSync(path.join(jsDir, file), 'utf8').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  vm.runInContext(code, ctx, { filename: file });
}

function loadCSV(name) {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return raw.split('\n').map(line => {
    const cells = []; let cell = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    return cells;
  });
}

// Generate large synthetic overhead: N halls x M pods x 20 racks
function generateGrid(halls, podsPerHall) {
  const types = ['HD-B2c', 'HD-B2c', 'HD-B2c', 'HD-B2c', 'HD-B2c', 'HD-B2c', 'HD-B2c', 'HD-B2c', 'IB x16', 'T1-E-v3b'];
  const grid = [];
  for (let h = 0; h < halls; h++) {
    // Hall header row
    const headerRow = new Array(halls * 25).fill('');
    const colBase = h * 25;
    headerRow[colBase] = `US-TEST01 DH${h + 1}`;
    grid.push(headerRow);
    grid.push(new Array(headerRow.length).fill('')); // blank row

    for (let p = 0; p < podsPerHall; p++) {
      // Per-pod numbering 1-20 (realistic: CW pods reset per pod)
      // Row 1: numbers ascending 1-10
      const numRow1 = new Array(headerRow.length).fill('');
      for (let r = 0; r < 10; r++) numRow1[colBase + r] = String(r + 1);
      grid.push(numRow1);

      // Row 2: types
      const typeRow1 = new Array(headerRow.length).fill('');
      for (let r = 0; r < 10; r++) typeRow1[colBase + r] = types[r];
      grid.push(typeRow1);

      // Row 3: numbers descending 20-11 (serpentine)
      const numRow2 = new Array(headerRow.length).fill('');
      for (let r = 0; r < 10; r++) numRow2[colBase + r] = String(20 - r);
      grid.push(numRow2);

      // Row 4: types
      const typeRow2 = new Array(headerRow.length).fill('');
      for (let r = 0; r < 10; r++) typeRow2[colBase + r] = types[r];
      grid.push(typeRow2);

      grid.push(new Array(headerRow.length).fill('')); // gap
    }
  }
  return grid;
}

// ── Run benchmarks ──
console.log('Parser Benchmark');
console.log('═'.repeat(70));

// Real fixtures
for (const fixture of ['simple-dh.csv', 'campus-style.csv', 'multi-type.csv', 'splat-ranges.csv']) {
  const grid = loadCSV(fixture);
  const p = vm.runInContext(`new LayoutParser(grid)`, Object.assign(ctx, { grid }));
  const result = p.parse();
  const t = result.timing;
  console.log(`\n${fixture} (${grid.length}r x ${Math.max(...grid.map(r=>r.length))}c, ${result.totalRacks} racks)`);
  console.log(`  Total: ${t.total}ms`);
  console.log(`  Pass1: ${t.pass1}ms | 1.5a: ${t['pass1.5a']}ms | 1.5b: ${t['pass1.5b']}ms`);
  console.log(`  Pass2: ${t.pass2}ms | 2.5: ${t['pass2.5']}ms`);
  console.log(`  Pass3: ${t.pass3}ms | Pass4: ${t.pass4}ms`);
}

// Synthetic: scale up
console.log('\n' + '═'.repeat(70));
console.log('Synthetic benchmarks (generated grids):\n');

for (const [halls, pods, label] of [[2, 5, 'Small (200 racks)'], [4, 10, 'Medium (800 racks)'], [4, 25, 'Large (2000 racks)'], [8, 25, 'XL (4000 racks)'], [8, 50, 'XXL (8000 racks)']]) {
  const grid = generateGrid(halls, pods);
  const totalExpected = halls * pods * 20;

  // Run 3 times, take median
  const times = [];
  for (let i = 0; i < 3; i++) {
    const p = vm.runInContext(`new LayoutParser(grid)`, Object.assign(ctx, { grid }));
    const result = p.parse();
    times.push(result.timing);
  }
  const median = times.sort((a, b) => a.total - b.total)[1];
  const result = vm.runInContext(`new LayoutParser(grid)`, Object.assign(ctx, { grid })).parse();

  console.log(`${label} — ${grid.length}r x ${Math.max(...grid.map(r=>r.length))}c, ${result.totalRacks}/${totalExpected} racks`);
  console.log(`  Total: ${median.total}ms (median of 3)`);
  console.log(`  Pass1: ${median.pass1}ms | 1.5a: ${median['pass1.5a']}ms | 1.5b: ${median['pass1.5b']}ms`);
  console.log(`  Pass2: ${median.pass2}ms | 2.5: ${median['pass2.5']}ms`);
  console.log(`  Pass3: ${median.pass3}ms | Pass4: ${median.pass4}ms`);
  console.log(`  Rate: ${(result.totalRacks / median.total * 1000).toFixed(0)} racks/sec`);
}
