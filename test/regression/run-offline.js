#!/usr/bin/env node
// Regression runner — compare LayoutParser output against reference ground truth
// Uses local CSV fixtures only (no network calls)
// Usage: node test/regression/run-offline.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { compareSite } = require('./compare');

// Bootstrap parser in VM context (same approach as parser.test.js)
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

const refData = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-data.json'), 'utf8'));

// Map CSV fixture filenames to NetBox zones.
// Some locodes (US-EWS01, US-LZL01, US-LHS01) span multiple zones with their own
// reference halls, so a fixture must pin to exactly one zone to compare cleanly.
// Add entries here as you download more site CSVs.
const FIXTURE_MAP = {
  'evi01-overhead.csv': 'US-CENTRAL-07A',
  'dgv01-overhead.csv': 'ATL2',
  'aai01-overhead.csv': 'ATL4',
  'ovo01-overhead.csv': 'EU-NORTH-02A',
  // 'spk02-overhead.csv': 'US-SPK02',  // STALE: fixture predates current Sector 2/4 build; sheet redesigned
  // 'vo201-overhead.csv': 'US-VO201',  // STALE: fixture from old "Data Hall 1" era; real VO201 now has DH900/700/600/3000
  'plz01-overhead.csv': 'US-CENTRAL-02A',
  'dtn01-overhead.csv': 'US-CENTRAL-03A',
  'plz02-overhead.csv': 'US-CENTRAL-04A',
  'rin01-overhead.csv': 'US-CENTRAL-05A',
  'obg01-overhead.csv': 'US-EAST-01A',
  'ews01-overhead.csv': 'US-EAST-02A',
  'bvi01-overhead.csv': 'US-EAST-03A',
};

function loadCSV(name) {
  const raw = fs.readFileSync(path.join(__dirname, '..', 'fixtures', name), 'utf8');
  // Multiline-aware CSV parser: split on newlines only outside quoted cells
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

// Optional filter: `node run-offline.js US-EWS01` (matches locode or zone).
const filterArg = process.argv[2] ? process.argv[2].toUpperCase() : null;

// Run comparisons
const scorecard = { generated: new Date().toISOString(), sites: [], summary: {} };
let totalPass = 0, totalHalls = 0, totalExpected = 0, totalFound = 0;

for (const [csvFile, zone] of Object.entries(FIXTURE_MAP)) {
  const fixtPath = path.join(__dirname, '..', 'fixtures', csvFile);
  if (!fs.existsSync(fixtPath)) {
    console.warn(`  Fixture not found: ${csvFile}`);
    continue;
  }

  const grid = loadCSV(csvFile);
  const parseResult = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));
  const refHalls = refData.halls.filter(h => h.zone === zone);

  if (refHalls.length === 0) {
    console.warn(`  No reference data for zone ${zone} (fixture ${csvFile})`);
    continue;
  }

  const locode = refHalls[0].locode;
  if (filterArg && locode !== filterArg && zone !== filterArg) continue;

  const siteResult = compareSite(parseResult, refHalls);
  scorecard.sites.push({ locode, zone, fixture: csvFile, ...siteResult });

  totalPass += siteResult.pass_count;
  totalHalls += siteResult.total_halls;
  totalExpected += siteResult.total_expected;
  totalFound += siteResult.total_found;

  const icon = siteResult.pass_count === siteResult.total_halls ? '\x1b[32m✓\x1b[0m' : '\x1b[33m△\x1b[0m';
  console.log(`${icon} ${locode} [${zone}]: ${siteResult.pass_count}/${siteResult.total_halls} halls pass | ` +
    `Hall-level: ${siteResult.total_found}/${siteResult.total_expected} racks (${siteResult.site_accuracy}%) | ` +
    `Flat: ${siteResult.parser_total_racks}/${siteResult.total_expected} (${siteResult.flat_accuracy}%)`);

  if (!siteResult.hall_distribution_ok) {
    console.log(`    \x1b[33m⚠\x1b[0m  Hall distribution mismatch: parser found ${siteResult.parser_total_racks} total racks but only ${siteResult.total_found} mapped to correct halls`);
  }

  for (const h of siteResult.halls) {
    if (h.status === 'PASS') {
      console.log(`    \x1b[32m✓\x1b[0m ${h.datahall}: ${h.found_racks}/${h.expected_racks}`);
    } else if (h.status === 'HALL_NOT_FOUND') {
      console.log(`    \x1b[31m✗\x1b[0m ${h.datahall}: NOT FOUND (expected ${h.expected_racks} racks)`);
    } else {
      console.log(`    \x1b[33m△\x1b[0m ${h.datahall}: ${h.found_racks}/${h.expected_racks} ` +
        `(${h.delta > 0 ? '+' : ''}${h.delta}) — ${h.missing_count} missing, ${h.extra_count} extra`);
      if (h.missing_racks.length) console.log(`      Missing: [${h.missing_racks.join(', ')}]`);
      if (h.extra_racks.length) console.log(`      Extra:   [${h.extra_racks.join(', ')}]`);
    }
  }
}

// Flat totals
let flatTotal = 0;
for (const s of scorecard.sites) flatTotal += s.parser_total_racks;

scorecard.summary = {
  halls_passed: totalPass,
  halls_total: totalHalls,
  hall_pass_rate: totalHalls > 0 ? Math.round(totalPass / totalHalls * 1000) / 10 : 0,
  racks_expected: totalExpected,
  racks_found_per_hall: totalFound,
  racks_found_flat: flatTotal,
  hall_level_accuracy: totalExpected > 0 ? Math.round((1 - Math.max(0, totalExpected - totalFound) / totalExpected) * 1000) / 10 : 0,
  flat_accuracy: totalExpected > 0 ? Math.round(Math.min(flatTotal, totalExpected) / totalExpected * 1000) / 10 : 0,
  fixtures_tested: scorecard.sites.length,
};

fs.writeFileSync(path.join(__dirname, 'scorecard.json'), JSON.stringify(scorecard, null, 2));

console.log('\n' + '='.repeat(70));
console.log('SCORECARD');
console.log('-'.repeat(70));
console.log(`  Hall matching:  ${totalPass}/${totalHalls} halls pass (${scorecard.summary.hall_pass_rate}%)`);
console.log(`  Hall-level:     ${totalFound}/${totalExpected} racks mapped to correct halls (${scorecard.summary.hall_level_accuracy}%)`);
console.log(`  Flat (total):   ${flatTotal}/${totalExpected} racks found overall (${scorecard.summary.flat_accuracy}%)`);
console.log(`  Fixtures:       ${scorecard.summary.fixtures_tested}`);
console.log('='.repeat(70));
