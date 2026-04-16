#!/usr/bin/env node
// Quick debug: show parser hall names for failing sites
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

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-data.json'), 'utf8'));
const failures = ['spk02', 'vo201', 'bvi01'];

for (const site of failures) {
  const csv = `${site}-overhead.csv`;
  const fixtPath = path.join(__dirname, '..', 'fixtures', csv);
  if (!fs.existsSync(fixtPath)) continue;

  const grid = loadCSV(csv);
  const pr = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));
  const locode = site === 'ovo01' ? 'NO-OVO01' : `US-${site.toUpperCase()}`;

  console.log(`\n=== ${locode} ===`);
  console.log('Parser halls:');
  for (const h of pr.halls) {
    let racks = 0;
    if (h.grids) for (const g of h.grids) for (const p of (g.pods || [])) for (const s of (p.sections || [])) for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
    console.log(`  "${h.name}" hallNum=${h.hallNum} racks=${racks}`);
  }
  console.log('Reference halls:');
  const refHalls = ref.halls.filter(h => h.locode === locode);
  for (const h of refHalls) console.log(`  "${h.datahall}": ${h.expected_rack_count} racks`);
}
