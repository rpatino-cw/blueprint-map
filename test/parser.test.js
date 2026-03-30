#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════
// PARSER TESTS — Zero dependencies, runs in Node.js
// Usage: node test/parser.test.js
// ════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ── Bootstrap: load browser JS into a shared context ──
const ctx = vm.createContext({
  console,
  localStorage: { getItem: () => null, setItem: () => {} },
  window: {},
});

const jsDir = path.join(__dirname, '..', 'js');
for (const file of ['type-library.js', 'parser.js']) {
  const code = fs.readFileSync(path.join(jsDir, file), 'utf8');
  vm.runInContext(code, ctx, { filename: file });
}

// ── Helpers ──
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

function parse(csvName) {
  const grid = loadCSV(csvName);
  return vm.runInContext(
    `new LayoutParser(grid).parse()`,
    Object.assign(ctx, { grid })
  );
}

// ── Test runner ──
let passed = 0, failed = 0, errors = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    failed++;
    errors.push({ name, error: e });
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ════════════════════════════════════════════════════════════════
// TYPE LIBRARY TESTS
// ════════════════════════════════════════════════════════════════
console.log('\nTypeLibrary');

test('matches compute prefixes', () => {
  const r = vm.runInContext(`TypeLibrary.match('HD-B2')`, ctx);
  assert.strictEqual(r.id, 'compute');
});

test('matches HD-GB4c as compute', () => {
  const r = vm.runInContext(`TypeLibrary.match('HD-GB4c')`, ctx);
  assert.strictEqual(r.id, 'compute');
});

test('matches IB spine', () => {
  const r = vm.runInContext(`TypeLibrary.match('IB x1')`, ctx);
  assert.strictEqual(r.id, 'ib-spine');
});

test('matches TOR/Edge variants', () => {
  const r = vm.runInContext(`TypeLibrary.match('T0-E-v11a')`, ctx);
  assert.strictEqual(r.id, 'tor');
});

test('matches FDP', () => {
  const r = vm.runInContext(`TypeLibrary.match('FDP-B2')`, ctx);
  assert.strictEqual(r.id, 'fdp');
});

test('matches RING', () => {
  const r = vm.runInContext(`TypeLibrary.match('RING-1b')`, ctx);
  assert.strictEqual(r.id, 'ring');
});

test('matches RoCE', () => {
  const r = vm.runInContext(`TypeLibrary.match('RoCE-T1')`, ctx);
  assert.strictEqual(r.id, 'roce');
});

test('matches Overflow', () => {
  const r = vm.runInContext(`TypeLibrary.match('OVERFLOW-T0-1')`, ctx);
  assert.strictEqual(r.id, 'overflow');
});

test('single-char U prefix does NOT match US-DTN01', () => {
  const r = vm.runInContext(`TypeLibrary.match('US-DTN01 NORTH CAMPUS BUILDING E')`, ctx);
  assert.strictEqual(r, null, 'Should not match Unallocated for US-DTN01');
});

test('single-char U matches U1 (with digit)', () => {
  const r = vm.runInContext(`TypeLibrary.match('U1')`, ctx);
  assert.strictEqual(r.id, 'unalloc');
});

test('single-char U matches "U 5" (with space)', () => {
  const r = vm.runInContext(`TypeLibrary.match('U 5')`, ctx);
  assert.strictEqual(r.id, 'unalloc');
});

test('returns null for empty string', () => {
  const r = vm.runInContext(`TypeLibrary.match('')`, ctx);
  assert.strictEqual(r, null);
});

test('returns null for null', () => {
  const r = vm.runInContext(`TypeLibrary.match(null)`, ctx);
  assert.strictEqual(r, null);
});

test('matches management hostnames', () => {
  const r = vm.runInContext(`TypeLibrary.match('mgmt-core-1')`, ctx);
  assert.strictEqual(r.id, 'mgmt');
});

test('matches console/OOB', () => {
  const r = vm.runInContext(`TypeLibrary.match('con-sw1')`, ctx);
  assert.strictEqual(r.id, 'console');
});

test('matches Reserved prefix', () => {
  const r = vm.runInContext(`TypeLibrary.match('RES')`, ctx);
  assert.strictEqual(r.id, 'reserved');
});

// ════════════════════════════════════════════════════════════════
// HELPER FUNCTION TESTS
// ════════════════════════════════════════════════════════════════
console.log('\nHelper functions');

test('decodeDH parses 3-digit DH (DH201 → floor:2, hall:1)', () => {
  const r = vm.runInContext(`decodeDH('DH201')`, ctx);
  assert.strictEqual(r.floor, 2);
  assert.strictEqual(r.hall, 1);
});

test('decodeDH parses 1-digit DH (DH1 → floor:null, hall:1)', () => {
  const r = vm.runInContext(`decodeDH('DH1')`, ctx);
  assert.strictEqual(r.floor, null);
  assert.strictEqual(r.hall, 1);
});

test('decodeDH returns nulls for non-DH string', () => {
  const r = vm.runInContext(`decodeDH('BUILDING E')`, ctx);
  assert.strictEqual(r.floor, null);
  assert.strictEqual(r.hall, null);
});

test('parseSPLAT parses frontend range', () => {
  const r = vm.runInContext(`parseSPLAT('SPLAT_US_LZL01_DH201_GG1_A_A1_1_SP1')`, ctx);
  assert.strictEqual(r.type, 'frontend');
  assert.strictEqual(r.locode, 'US_LZL01');
  assert.strictEqual(r.dh, 'DH201');
  assert.strictEqual(r.gg, 'GG1');
  assert.strictEqual(r.grid, 'A');
  assert.strictEqual(r.pod, 'A1');
  assert.strictEqual(r.seq, 1);
  assert.strictEqual(r.sp, 'SP1');
});

test('parseSPLAT parses RoCE range', () => {
  const r = vm.runInContext(`parseSPLAT('SPLAT_US_LZL01_DH201_ROCE_SP1_D_G4T1')`, ctx);
  assert.strictEqual(r.type, 'roce');
  assert.strictEqual(r.sp, 'SP1');
  assert.strictEqual(r.plane, 'D');
});

test('parseSPLAT parses overflow range', () => {
  const r = vm.runInContext(`parseSPLAT('SPLAT_US_LZL01_DH201_ROCE_SP1_T0_OVERFLOW_1')`, ctx);
  assert.strictEqual(r.type, 'overflow');
  assert.strictEqual(r.overflow, 1);
});

test('parseSPLAT returns null for non-SPLAT', () => {
  const r = vm.runInContext(`parseSPLAT('HD-B2')`, ctx);
  assert.strictEqual(r, null);
});

// ════════════════════════════════════════════════════════════════
// PASS 1: CLASSIFICATION TESTS
// ════════════════════════════════════════════════════════════════
console.log('\nPass 1 — Cell classification');

test('simple-dh: detects site as US-TEST01', () => {
  const pr = parse('simple-dh.csv');
  assert.strictEqual(pr.site, 'US-TEST01');
});

test('simple-dh: finds 1 hall header', () => {
  const pr = parse('simple-dh.csv');
  assert.strictEqual(pr.hallHeaders.length, 1);
});

test('simple-dh: classifies HD-B2 as rack-type', () => {
  const pr = parse('simple-dh.csv');
  const typeKinds = pr.classified.flat().filter(c => c.value === 'HD-B2');
  assert.ok(typeKinds.length > 0, 'Should find HD-B2 cells');
  assert.ok(typeKinds.every(c => c.kind === 'rack-type'), 'All HD-B2 should be rack-type');
});

test('simple-dh: detects rack numbers', () => {
  const pr = parse('simple-dh.csv');
  assert.ok(pr.totalRacks >= 20, `Expected >=20 racks, got ${pr.totalRacks}`);
});

test('campus-style: detects 2 hall headers', () => {
  const pr = parse('campus-style.csv');
  assert.strictEqual(pr.hallHeaders.length, 2);
});

test('campus-style: hall header is NORTH CAMPUS BUILDING E (not full string)', () => {
  const pr = parse('campus-style.csv');
  const names = pr.hallHeaders.map(h => h.value);
  assert.ok(names.some(n => /NORTH CAMPUS BUILDING E/i.test(n)),
    `Expected "NORTH CAMPUS BUILDING E" in ${JSON.stringify(names)}`);
});

test('campus-style: US-DTN01 does NOT classify as rack-type', () => {
  const pr = parse('campus-style.csv');
  const row2 = pr.classified[1] || [];
  const hallCells = row2.filter(c => /US-DTN01/.test(c.value));
  assert.ok(hallCells.length > 0, 'Should find US-DTN01 cells');
  assert.ok(hallCells.every(c => c.kind === 'hall-header'),
    `US-DTN01 cells should be hall-header, got: ${hallCells.map(c => c.kind)}`);
});

test('campus-style: ROWS labels classified as grid-label', () => {
  const pr = parse('campus-style.csv');
  const rowsLabels = pr.classified.flat().filter(c => /^ROWS?\s+\d/.test(c.value));
  assert.ok(rowsLabels.length > 0, 'Should find ROWS labels');
  assert.ok(rowsLabels.every(c => c.kind === 'grid-label'),
    `ROWS should be grid-label, got: ${rowsLabels.map(c => c.kind)}`);
});

test('campus-style: FDP-B2 classified as rack-type', () => {
  const pr = parse('campus-style.csv');
  const fdps = pr.classified.flat().filter(c => c.value === 'FDP-B2');
  assert.ok(fdps.length > 0, 'Should find FDP-B2');
  assert.ok(fdps.every(c => c.kind === 'rack-type'), 'FDP-B2 should be rack-type');
});

test('campus-style: RING-1b classified as rack-type', () => {
  const pr = parse('campus-style.csv');
  const rings = pr.classified.flat().filter(c => c.value === 'RING-1b');
  assert.ok(rings.length > 0, 'Should find RING-1b');
  assert.ok(rings.every(c => c.kind === 'rack-type'), 'RING-1b should be rack-type');
});

test('campus-style: site extracted as US-DTN01', () => {
  const pr = parse('campus-style.csv');
  assert.strictEqual(pr.site, 'US-DTN01');
});

// ════════════════════════════════════════════════════════════════
// PASS 2: BLOCK DETECTION
// ════════════════════════════════════════════════════════════════
console.log('\nPass 2 — Block detection');

test('simple-dh: detects blocks with serpentine numbering', () => {
  const pr = parse('simple-dh.csv');
  assert.ok(pr.blocks.length >= 2, `Expected >=2 blocks, got ${pr.blocks.length}`);
  const serpentine = pr.blocks.filter(b => b.serpentine);
  assert.ok(serpentine.length >= 1, 'Should detect at least 1 serpentine pair');
});

test('multi-type: detects blocks across different type categories', () => {
  const pr = parse('multi-type.csv');
  assert.ok(pr.blocks.length >= 2, `Expected >=2 blocks, got ${pr.blocks.length}`);
});

test('simple-dh: block has correct rack count per row', () => {
  const pr = parse('simple-dh.csv');
  const block = pr.blocks[0];
  assert.ok(block, 'Should have at least 1 block');
  assert.strictEqual(block.rackNums.length, 10, 'First block should have 10 racks');
});

// ════════════════════════════════════════════════════════════════
// PASS 2.5: TYPE DISCOVERY
// ════════════════════════════════════════════════════════════════
console.log('\nPass 2.5 — Type discovery');

test('multi-type: identifies multiple rack type categories', () => {
  const pr = parse('multi-type.csv');
  const allTypes = new Set();
  for (const b of pr.blocks) {
    for (const t of b.rackTypes) {
      const m = vm.runInContext(`TypeLibrary.match(t)`, Object.assign(ctx, { t }));
      if (m) allTypes.add(m.id);
    }
  }
  assert.ok(allTypes.size >= 2, `Expected >=2 type categories, got ${allTypes.size}: ${[...allTypes]}`);
});

// ════════════════════════════════════════════════════════════════
// PASS 3: SECTION GROUPING
// ════════════════════════════════════════════════════════════════
console.log('\nPass 3 — Section grouping');

test('simple-dh: groups blocks into sections', () => {
  const pr = parse('simple-dh.csv');
  assert.ok(pr.sections.length >= 1, `Expected >=1 section, got ${pr.sections.length}`);
});

test('simple-dh: sections contain blocks', () => {
  const pr = parse('simple-dh.csv');
  for (const sec of pr.sections) {
    assert.ok(sec.blocks.length >= 1, 'Each section should have at least 1 block');
  }
});

// ════════════════════════════════════════════════════════════════
// PASS 4: HIERARCHY
// ════════════════════════════════════════════════════════════════
console.log('\nPass 4 — Hierarchy assignment');

test('simple-dh: assigns halls', () => {
  const pr = parse('simple-dh.csv');
  assert.ok(pr.halls.length >= 1, `Expected >=1 hall, got ${pr.halls.length}`);
});

test('simple-dh: hall name is DH101', () => {
  const pr = parse('simple-dh.csv');
  assert.ok(pr.halls.some(h => h.name === 'DH101'),
    `Expected hall named DH101, got: ${pr.halls.map(h => h.name)}`);
});

test('campus-style: assigns 2 halls for 2 buildings', () => {
  const pr = parse('campus-style.csv');
  assert.strictEqual(pr.halls.length, 2, `Expected 2 halls, got ${pr.halls.length}`);
});

test('splat-ranges: detects SPLAT named ranges', () => {
  const pr = parse('splat-ranges.csv');
  assert.ok(pr.splatRanges.length >= 1, 'Should find at least 1 SPLAT range');
  assert.strictEqual(pr.splatRanges[0].parsed.type, 'frontend');
});

test('splat-ranges: detects grid labels', () => {
  const pr = parse('splat-ranges.csv');
  assert.ok(pr.gridLabels.length >= 1, 'Should find grid labels');
});

// ════════════════════════════════════════════════════════════════
// RESULT STRUCTURE
// ════════════════════════════════════════════════════════════════
console.log('\nResult structure');

test('result has all required fields', () => {
  const pr = parse('simple-dh.csv');
  const required = ['site', 'halls', 'blocks', 'sections', 'gridLabels',
    'hallHeaders', 'splatRanges', 'stats', 'warnings', 'classified',
    'grid', 'totalRacks', 'cols', 'rows'];
  for (const field of required) {
    assert.ok(field in pr, `Missing field: ${field}`);
  }
});

test('totalRacks matches sum of block rack counts', () => {
  const pr = parse('simple-dh.csv');
  let sum = 0;
  for (const b of pr.blocks) sum += b.rackNums.length;
  assert.strictEqual(pr.totalRacks, sum);
});

// ════════════════════════════════════════════════════════════════
// SUMMARY
// ════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`${passed} passed, ${failed} failed`);
if (errors.length) {
  console.log('\nFailures:');
  for (const { name, error } of errors) {
    console.log(`\n  \x1b[31m✗ ${name}\x1b[0m`);
    console.log(`    ${error.message}`);
  }
}
console.log();
process.exit(failed > 0 ? 1 : 0);
