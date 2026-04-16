#!/usr/bin/env node
// Audit every cell classification — find what the parser doesn't understand
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
for (const f of ['type-library.js', 'parser.js']) {
  vm.runInContext(fs.readFileSync(path.join(jsDir, f), 'utf8'), ctx, { filename: f });
}

function loadCSV(name) {
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
  return raw.split('\n').map(line => {
    const cells = [];
    let cell = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { cells.push(cell); cell = ''; continue; }
      cell += ch;
    }
    cells.push(cell);
    return cells;
  });
}

// Run on all fixtures
for (const fixture of ['simple-dh.csv', 'campus-style.csv', 'multi-type.csv', 'splat-ranges.csv', 'real-world-noise.csv']) {
  const grid = loadCSV(fixture);
  ctx.grid = grid;
  const result = vm.runInContext('new LayoutParser(grid).parse()', ctx);

  const counts = {};
  const textCells = [];
  let totalNonEmpty = 0;

  for (let r = 0; r < result.classified.length; r++) {
    for (let c = 0; c < (result.classified[r] || []).length; c++) {
      const cell = result.classified[r][c];
      if (!cell) continue;
      counts[cell.kind] = (counts[cell.kind] || 0) + 1;
      if (cell.kind !== 'empty') totalNonEmpty++;
      if (cell.kind === 'text' && cell.value) {
        textCells.push({ r: r + 1, c: c + 1, v: cell.value });
      }
    }
  }

  const understood = totalNonEmpty - (textCells.length);
  const pct = totalNonEmpty > 0 ? ((understood / totalNonEmpty) * 100).toFixed(1) : '0';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${fixture} — ${result.totalRacks} racks, ${result.rows}r x ${result.cols}c`);
  console.log(`Understanding: ${pct}% (${understood}/${totalNonEmpty} non-empty cells classified)`);
  console.log(`${'='.repeat(60)}`);

  console.log('\nClassification breakdown:');
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    if (k === 'empty') continue;
    console.log(`  ${String(v).padStart(4)}  ${k}`);
  }

  if (textCells.length > 0) {
    console.log(`\nUNCLASSIFIED cells (kind=text) — parser doesn't know what these are:`);
    for (const t of textCells) {
      console.log(`  Row ${t.r}, Col ${t.c}: "${t.v}"`);
    }
  } else {
    console.log('\n  Every non-empty cell is classified. No unknowns.');
  }
}
