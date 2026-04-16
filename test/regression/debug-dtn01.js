#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({
  console, localStorage: { getItem: () => null, setItem: () => {} }, window: {},
});
const jsDir = path.join(__dirname, '..', '..', 'js');
for (const file of ['type-library.js', 'parser.js', 'netbox-matcher.js']) {
  const src = path.join(jsDir, file);
  if (!fs.existsSync(src)) continue;
  const code = fs.readFileSync(src, 'utf8').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  vm.runInContext(code, ctx, { filename: file });
}

function loadCSV(name) {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
  const lines = [];
  let line = '', inQuote = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') { inQuote = !inQuote; line += ch; continue; }
    if (ch === '\r') continue;
    if (ch === '\n' && !inQuote) { lines.push(line); line = ''; continue; }
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

const grid = loadCSV('dtn01-overhead.csv');
const pr = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));

console.log('Halls:', pr.halls.length);
for (const h of pr.halls) {
  let racks = 0;
  if (h.grids) for (const g of h.grids) for (const p of (g.pods || [])) for (const s of (p.sections || [])) for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
  if (h.sections) for (const s of h.sections) for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
  console.log(`  "${h.name}" hallNum=${h.hallNum} floor=${h.floor} racks=${racks}`);
}

console.log('\nHall headers:');
for (const hh of pr.hallHeaders) {
  console.log(`  row=${hh.row} col=${hh.col} "${hh.value}"`);
}

console.log('\nReference expects:');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-data.json'), 'utf8'));
const dtnHalls = ref.halls.filter(h => h.locode === 'US-DTN01');
for (const h of dtnHalls) {
  console.log(`  "${h.datahall}": ${h.expected_rack_count} racks`);
}

console.log('\ntotalRacks:', pr.totalRacks);
