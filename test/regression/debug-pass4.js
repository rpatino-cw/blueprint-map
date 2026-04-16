#!/usr/bin/env node
// Debug Pass 4: show hall header positions, layout detection, and section assignment
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

const grid = loadCSV('evi01-overhead.csv');
const pr = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));

// Show hall headers with positions
console.log('Hall headers detected:');
for (const hh of pr.hallHeaders || []) {
  console.log(`  "${hh.value}" at row=${hh.row} col=${hh.col}`);
}

// Compute layout detection values
const hallMap = new Map();
for (const hh of pr.hallHeaders || []) {
  const dhm = hh.value.match(/DH(\d+)|DATA\s*HALL\s*(\d+)|^Hall\s*(\d+)$/i);
  const hallName = dhm ? 'DH' + (dhm[1] || dhm[2] || dhm[3]) : hh.value.trim().substring(0, 40);
  let span = 1;
  for (let cc = hh.col + 1; cc < (grid[hh.row]?.length || 0); cc++) {
    if (!grid[hh.row][cc]?.trim()) span++; else break;
  }
  if (!hallMap.has(hallName)) {
    hallMap.set(hallName, { name: hallName, row: hh.row, colMin: hh.col, colMax: hh.col + span });
  } else {
    const h = hallMap.get(hallName);
    h.colMin = Math.min(h.colMin, hh.col);
    h.colMax = Math.max(h.colMax, hh.col + span);
  }
}

console.log('\nHall boundaries:');
for (const [name, h] of hallMap) {
  console.log(`  ${name}: row=${h.row} cols=${h.colMin}-${h.colMax}`);
}

const hallValues = [...hallMap.values()];
const colMinSpread = hallValues.length >= 2
  ? Math.max(...hallValues.map(h => h.colMin)) - Math.min(...hallValues.map(h => h.colMin))
  : 0;
const isStacked = hallValues.length >= 2 && colMinSpread <= 5;

console.log(`\nLayout detection:`);
console.log(`  colMinSpread: ${colMinSpread} (threshold: 5)`);
console.log(`  isStacked: ${isStacked}`);
console.log(`  Hall count: ${hallValues.length}`);

// Show sections and which hall column range they'd fall in
console.log('\nSection → Hall column overlap:');
for (const sec of pr.sections) {
  const secMid = (sec.startCol + sec.endCol) / 2;
  const matches = [];
  for (const [name, h] of hallMap) {
    if (secMid >= h.colMin - 3 && secMid <= h.colMax + 3) {
      matches.push(`${name}(col ${h.colMin}-${h.colMax})`);
    }
  }
  console.log(`  Section row ${sec.minRow}-${sec.maxRow} col ${sec.startCol}-${sec.endCol} (mid=${secMid}): matches=[${matches.join(', ')}] → assigned="${sec.hall}"`);
}

console.log('\nWarnings:', pr.warnings);
