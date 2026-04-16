#!/usr/bin/env node
// Debug: show what halls the parser finds for EVI01
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

console.log('Halls found:', pr.halls.length);
for (const h of pr.halls) {
  console.log(`  name: "${h.name}"  hallNum: ${h.hallNum}  floor: ${h.floor}`);

  let racks = 0;
  // Try sections path
  if (h.sections) {
    for (const s of h.sections) {
      for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
    }
  }
  // Try grids path
  if (racks === 0 && h.grids) {
    for (const g of h.grids) {
      for (const p of (g.pods || [])) {
        for (const s of (p.sections || [])) {
          for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
        }
      }
      for (const gg of (g.gridGroups || [])) {
        for (const p of (gg.pods || [])) {
          for (const s of (p.sections || [])) {
            for (const b of (s.blocks || [])) racks += (b.rackNums || []).length;
          }
        }
      }
    }
  }
  console.log(`    racks: ${racks}`);
}
console.log('totalRacks:', pr.totalRacks);
console.log('blocks:', pr.blocks.length);
console.log('sections:', pr.sections.length);

// Show sections and which hall they belong to
console.log('\nSections → Hall mapping:');
for (const s of pr.sections) {
  const hallName = s.hall || 'UNASSIGNED';
  let rackCount = 0;
  for (const b of s.blocks) rackCount += (b.rackNums || []).length;
  console.log(`  Section row ${s.minRow}-${s.maxRow} col ${s.startCol}-${s.endCol}: hall="${hallName}" racks=${rackCount}`);
}

// Show hall → grid → pod structure
console.log('\nHall hierarchy:');
for (const h of pr.halls) {
  console.log(`  ${h.name}:`);
  if (h.grids) {
    for (const g of h.grids) {
      console.log(`    Grid ${g.letter || '?'}:`);
      if (g.pods) for (const p of g.pods) {
        let rc = 0;
        for (const s of (p.sections || [])) for (const b of (s.blocks || [])) rc += (b.rackNums || []).length;
        console.log(`      Pod ${p.name || '?'}: ${rc} racks, ${(p.sections||[]).length} sections`);
      }
      if (g.gridGroups) for (const gg of g.gridGroups) {
        console.log(`    GG ${gg.name || '?'}:`);
        if (gg.pods) for (const p of gg.pods) {
          let rc = 0;
          for (const s of (p.sections || [])) for (const b of (s.blocks || [])) rc += (b.rackNums || []).length;
          console.log(`      Pod ${p.name || '?'}: ${rc} racks, ${(p.sections||[]).length} sections`);
        }
      }
    }
  }
  if (h.sections) {
    for (const s of h.sections) {
      let rc = 0;
      for (const b of (s.blocks || [])) rc += (b.rackNums || []).length;
      console.log(`    Direct section: ${rc} racks`);
    }
  }
}

// Show reference expectations
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-data.json'), 'utf8'));
const eviHalls = ref.halls.filter(h => h.locode === 'US-EVI01');
console.log('\nReference expects:');
for (const h of eviHalls) {
  console.log(`  "${h.datahall}": ${h.expected_rack_count} racks`);
}
