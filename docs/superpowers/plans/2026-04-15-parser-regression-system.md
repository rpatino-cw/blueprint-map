# Blueprint Map Parser Regression System

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated regression system that compares Blueprint Map parser output against overhead2svg's 107 ground-truth hall entries across 47 sites, identifies accuracy gaps, and drives parser improvements.

**Architecture:** A Node.js test harness reads overhead2svg's `data-hall-mapping.json` as ground truth (rack counts per hall), extracts rack IDs/hostnames from the pre-generated SVGs, and compares them against Blueprint Map parser output for the same Google Sheets. A new `test/regression/` directory houses comparison scripts, extracted reference data, and a score report. Parser improvements are driven by the delta between Blueprint Map's output and the reference data.

**Tech Stack:** Node.js (zero deps, matching existing test approach), vanilla JS SVG parsing via regex (no DOM lib needed — SVGs are simple), existing `LayoutParser` class.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `test/regression/extract-reference.js` | One-time script: parse all overhead2svg SVGs → extract rack IDs, hostnames, counts → write `reference-data.json` |
| `test/regression/reference-data.json` | Ground truth: per-hall rack counts, rack IDs, hostnames extracted from overhead2svg SVGs |
| `test/regression/site-map.json` | Maps overhead2svg locodes to Blueprint Map Google Sheet IDs (manual + auto-matched) |
| `test/regression/compare.js` | Core comparison: parse a CSV via LayoutParser, compare rack count + IDs against reference-data.json, output delta report |
| `test/regression/run-all.js` | Batch runner: loop all sites in site-map.json, fetch sheets, parse, compare, output scorecard |
| `test/regression/scorecard.json` | Output: per-site/per-hall accuracy scores, rack count delta, missing/extra racks |
| `test/regression/README.md` | How to run, how to interpret results, how to add new sites |

**Existing files modified:**

| File | Change |
|------|--------|
| `js/parser.js` | Bug fixes driven by regression failures (Tasks 5+) |
| `test/parser.test.js` | New regression-derived test cases |
| `package.json` | Add `"test:regression"` script |

---

## Chunk 1: Reference Data Extraction

### Task 1: Extract rack data from overhead2svg SVGs

**Files:**
- Create: `test/regression/extract-reference.js`
- Create: `test/regression/reference-data.json`

- [ ] **Step 1: Write the SVG extractor script**

The overhead2svg SVGs use a consistent structure:
- Rack containers: `<g data-cell-id="rack-NNN">`
- Rack ID: `id="rack-NNN"`
- Rack label: `data-label="N"` (the display number)
- Hostname: `<title>HOSTNAME</title>` inside the rack group
- Fill color: `fill="#d9d9d9"` (or `#efefef`, `#cccccc`)

```javascript
#!/usr/bin/env node
// Extract rack reference data from overhead2svg SVGs
// Usage: node test/regression/extract-reference.js

const fs = require('fs');
const path = require('path');

const O2S_OUTPUT = path.join(__dirname, '..', '..', '..', 'overhead2svg', 'output');
const MAPPING_FILE = path.join(O2S_OUTPUT, 'data-hall-mapping.json');
const MISSING_FILE = path.join(O2S_OUTPUT, 'data-hall-missing.json');
const OUT_FILE = path.join(__dirname, 'reference-data.json');

// Read mapping + missing
const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
const missing = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
const missingSet = new Set(missing.map(m => m.named_range));

const reference = { generated: new Date().toISOString(), halls: [], missing: [], stats: {} };

for (const entry of mapping) {
  const svgPath = path.join(O2S_OUTPUT, entry.zone, `${entry.file_prefix}.svg`);
  if (!fs.existsSync(svgPath)) {
    reference.missing.push({ ...entry, reason: 'svg_not_found' });
    continue;
  }

  const svg = fs.readFileSync(svgPath, 'utf8');

  // Extract rack IDs and labels
  const rackPattern = /<g\s+id="(rack-\d+)"\s+data-label="(\d+)">/g;
  const titlePattern = /<g\s+data-cell-id="(rack-\d+)"[\s\S]*?<title>([^<]*)<\/title>/g;

  const racks = [];
  let m;
  while ((m = rackPattern.exec(svg)) !== null) {
    racks.push({ id: m[1], label: +m[2] });
  }

  // Extract hostnames
  const hostnames = {};
  while ((m = titlePattern.exec(svg)) !== null) {
    hostnames[m[1]] = m[2];
  }

  // Attach hostnames to racks
  for (const rack of racks) {
    rack.hostname = hostnames[rack.id] || null;
  }

  // Extract viewBox for coordinate validation
  const vbMatch = svg.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch ? vbMatch[1] : null;

  reference.halls.push({
    zone: entry.zone,
    locode: entry.locode_name,
    named_range: entry.named_range,
    datahall: entry.datahall_name,
    datahall_slug: entry.datahall_slug,
    expected_rack_count: entry.rack_count,
    extracted_rack_count: racks.length,
    rack_count_match: entry.rack_count === racks.length,
    racks: racks.map(r => ({ label: r.label, hostname: r.hostname })),
    rack_labels: racks.map(r => r.label).sort((a, b) => a - b),
    viewBox,
  });
}

// Add missing halls from overhead2svg
for (const m of missing) {
  reference.missing.push({ ...m, reason: 'overhead2svg_failed' });
}

// Stats
reference.stats = {
  total_halls: reference.halls.length,
  total_racks: reference.halls.reduce((s, h) => s + h.extracted_rack_count, 0),
  total_missing: reference.missing.length,
  zones: [...new Set(reference.halls.map(h => h.zone))].length,
  locodes: [...new Set(reference.halls.map(h => h.locode))].length,
};

fs.writeFileSync(OUT_FILE, JSON.stringify(reference, null, 2));
console.log(`Reference data written to ${OUT_FILE}`);
console.log(`  Halls: ${reference.stats.total_halls}`);
console.log(`  Racks: ${reference.stats.total_racks}`);
console.log(`  Missing: ${reference.stats.total_missing}`);
console.log(`  Zones: ${reference.stats.zones}`);
```

- [ ] **Step 2: Run the extractor**

Run: `node test/regression/extract-reference.js`
Expected: `reference-data.json` created with ~107 hall entries, rack counts matching `data-hall-mapping.json`

- [ ] **Step 3: Validate reference data integrity**

```javascript
// Add to end of extract-reference.js, or run separately:
// Quick sanity check
const data = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
let mismatches = 0;
for (const h of data.halls) {
  if (!h.rack_count_match) {
    console.warn(`  MISMATCH: ${h.zone}/${h.datahall} — mapping says ${h.expected_rack_count}, SVG has ${h.extracted_rack_count}`);
    mismatches++;
  }
}
console.log(`\nRack count mismatches: ${mismatches}/${data.halls.length}`);
```

Run: `node test/regression/extract-reference.js`
Expected: 0 mismatches (SVG rack count = mapping.json rack count)

- [ ] **Step 4: Commit**

```bash
git add test/regression/extract-reference.js test/regression/reference-data.json
git commit -m "feat: add overhead2svg reference data extractor — 107 halls, ground truth for regression"
```

---

### Task 2: Build the site mapping file

**Files:**
- Create: `test/regression/site-map.json`

The site map connects overhead2svg locodes to Blueprint Map Google Sheet IDs so the comparison script knows which sheet to parse for each site.

- [ ] **Step 1: Auto-generate site map from index.html**

```javascript
#!/usr/bin/env node
// Generate site-map.json by matching overhead2svg locodes to Blueprint Map sheet IDs
// Usage: node test/regression/build-site-map.js

const fs = require('fs');
const path = require('path');

const INDEX_HTML = path.join(__dirname, '..', '..', 'index.html');
const REF_DATA = path.join(__dirname, 'reference-data.json');
const OUT_FILE = path.join(__dirname, 'site-map.json');

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const ref = JSON.parse(fs.readFileSync(REF_DATA, 'utf8'));

// Extract sheet options from index.html: value="SHEET_ID">LABEL</option>
const optionPattern = /value="([^"]{20,})"[^>]*>([^<]+)</g;
const sheets = [];
let m;
while ((m = optionPattern.exec(html)) !== null) {
  // Parse locode from label: "EVI01 — Elk Grove (US-CENTRAL-07A)"
  const label = m[2].trim();
  const locodeMatch = label.match(/^(\w+)\s/);
  const locode = locodeMatch ? `US-${locodeMatch[1]}` : null;
  sheets.push({ sheetId: m[1], label, locode });
}

// Get unique locodes from reference data
const refLocodes = [...new Set(ref.halls.map(h => h.locode))];

// Match
const siteMap = { generated: new Date().toISOString(), sites: [], unmatched_ref: [], unmatched_bp: [] };

for (const locode of refLocodes) {
  const sheet = sheets.find(s => s.locode === locode);
  if (sheet) {
    const halls = ref.halls.filter(h => h.locode === locode);
    siteMap.sites.push({
      locode,
      sheetId: sheet.sheetId,
      label: sheet.label,
      halls: halls.map(h => ({
        named_range: h.named_range,
        datahall: h.datahall,
        expected_racks: h.expected_rack_count,
      })),
    });
  } else {
    siteMap.unmatched_ref.push(locode);
  }
}

// Blueprint Map sites not in overhead2svg
for (const s of sheets) {
  if (s.locode && !refLocodes.includes(s.locode)) {
    siteMap.unmatched_bp.push({ locode: s.locode, label: s.label });
  }
}

console.log(`Matched: ${siteMap.sites.length} sites`);
console.log(`Unmatched (overhead2svg only): ${siteMap.unmatched_ref.length}`);
console.log(`Unmatched (Blueprint Map only): ${siteMap.unmatched_bp.length}`);

fs.writeFileSync(OUT_FILE, JSON.stringify(siteMap, null, 2));
console.log(`Site map written to ${OUT_FILE}`);
```

Save as: `test/regression/build-site-map.js`

- [ ] **Step 2: Run site map builder**

Run: `node test/regression/build-site-map.js`
Expected: ~35-40 matched sites, small number of unmatched on each side

- [ ] **Step 3: Manually fill gaps in site-map.json**

Some locodes may not auto-match due to naming differences (e.g., `US-DGV01` = `ATL2`, `US-AAI01` = `ATL4`). Open `site-map.json` and manually add `sheetId` for any `unmatched_ref` entries using the Sheet IDs from `index.html`.

Known aliases to handle:
- `US-DGV01` → DGV01 (ATL2) → Sheet ID `17Bi2G9iguYZFcqRSXGchv0Sa51pf5Sh-nCZKYPDLuV4`
- `US-AAI01` → AAI01 (ATL4) → Sheet ID `1LM_xLgMenYkHaaUn2-AMsDnnlOCLwnObH65Lhf36xfw`
- `US-WJQ01` → WJQ01 (LGA1) → Sheet ID `1FhEUEZhmXSexckSM7W5gOX7x2GICqwGvYBUY2PC48Ow`

- [ ] **Step 4: Commit**

```bash
git add test/regression/build-site-map.js test/regression/site-map.json
git commit -m "feat: add site map linking overhead2svg locodes to Blueprint Map sheet IDs"
```

---

## Chunk 2: Comparison Engine

### Task 3: Build the per-hall comparison script

**Files:**
- Create: `test/regression/compare.js`

This is the core engine: given a parsed `ParseResult` and a reference hall entry, compute the accuracy delta.

- [ ] **Step 1: Write the comparison module**

```javascript
// compare.js — compare LayoutParser output against overhead2svg reference
// Usage: const { compareHall, compareSite } = require('./compare');

function compareHall(parseResult, refHall) {
  // Find matching hall in parse result
  const hallName = refHall.datahall;
  const prHall = parseResult.halls.find(h => {
    // Match by hall number, name, or slug
    const hn = h.name || '';
    return hn.includes(hallName)
      || hn.replace(/\s+/g, '').toLowerCase() === hallName.replace(/\s+/g, '').toLowerCase()
      || (h.hallNum && `DH${h.hallNum}` === hallName)
      || (h.hallNum && `Data Hall ${h.hallNum}` === hallName);
  });

  if (!prHall) {
    return {
      status: 'HALL_NOT_FOUND',
      datahall: hallName,
      expected_racks: refHall.expected_rack_count,
      found_racks: 0,
      delta: -refHall.expected_rack_count,
      details: `Parser did not detect hall "${hallName}"`,
    };
  }

  // Count racks in parser hall
  const prRacks = [];
  for (const section of (prHall.sections || [])) {
    for (const block of (section.blocks || [])) {
      prRacks.push(...(block.rackNums || []));
    }
  }
  // Also check grids → pods → sections path
  if (prRacks.length === 0 && prHall.grids) {
    for (const grid of prHall.grids) {
      for (const pod of (grid.pods || [])) {
        for (const section of (pod.sections || [])) {
          for (const block of (section.blocks || [])) {
            prRacks.push(...(block.rackNums || []));
          }
        }
      }
    }
  }

  const prCount = prRacks.length;
  const refCount = refHall.expected_rack_count;
  const delta = prCount - refCount;
  const refLabels = new Set(refHall.rack_labels);
  const prLabels = new Set(prRacks);

  const missing = [...refLabels].filter(l => !prLabels.has(l));
  const extra = [...prLabels].filter(l => !refLabels.has(l));

  return {
    status: delta === 0 && missing.length === 0 ? 'PASS' : 'DELTA',
    datahall: hallName,
    expected_racks: refCount,
    found_racks: prCount,
    delta,
    accuracy: refCount > 0 ? Math.round((1 - Math.abs(delta) / refCount) * 1000) / 10 : 0,
    missing_racks: missing.slice(0, 20), // cap for readability
    extra_racks: extra.slice(0, 20),
    missing_count: missing.length,
    extra_count: extra.length,
  };
}

function compareSite(parseResult, refHalls) {
  const results = refHalls.map(rh => compareHall(parseResult, rh));
  const totalExpected = refHalls.reduce((s, h) => s + h.expected_rack_count, 0);
  const totalFound = results.reduce((s, r) => s + r.found_racks, 0);
  return {
    halls: results,
    total_expected: totalExpected,
    total_found: totalFound,
    total_delta: totalFound - totalExpected,
    pass_count: results.filter(r => r.status === 'PASS').length,
    total_halls: results.length,
    site_accuracy: totalExpected > 0 ? Math.round((1 - Math.abs(totalFound - totalExpected) / totalExpected) * 1000) / 10 : 0,
  };
}

module.exports = { compareHall, compareSite };
```

- [ ] **Step 2: Write a unit test for compare.js**

```javascript
// test/regression/compare.test.js
const assert = require('assert');
const { compareHall } = require('./compare');

// Mock a perfect match
const refHall = { datahall: 'DH1', expected_rack_count: 20, rack_labels: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] };
const mockParseResult = {
  halls: [{
    name: 'DH1', hallNum: 1,
    grids: [{ pods: [{ sections: [{ blocks: [{ rackNums: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] }] }] }] }],
  }],
};

const result = compareHall(mockParseResult, refHall);
assert.strictEqual(result.status, 'PASS');
assert.strictEqual(result.delta, 0);
assert.strictEqual(result.missing_count, 0);
console.log('  \x1b[32m✓\x1b[0m compare.js unit tests pass');
```

- [ ] **Step 3: Run the test**

Run: `node test/regression/compare.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add test/regression/compare.js test/regression/compare.test.js
git commit -m "feat: add hall comparison engine — rack count delta, missing/extra rack detection"
```

---

### Task 4: Build the batch runner and scorecard

**Files:**
- Create: `test/regression/run-offline.js`
- Create: `test/regression/scorecard.json` (generated output)
- Modify: `package.json` — add script

This runner works **offline** using the existing EVI01 CSV fixture and any other CSVs already in `test/fixtures/`. A separate `run-live.js` (Task 6) will fetch sheets via the Google API.

- [ ] **Step 1: Write the offline batch runner**

```javascript
#!/usr/bin/env node
// Run regression comparison using local CSV fixtures
// Usage: node test/regression/run-offline.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { compareSite } = require('./compare');

// Bootstrap parser (same as parser.test.js)
const ctx = vm.createContext({
  console, localStorage: { getItem: () => null, setItem: () => {} }, window: {},
});
const jsDir = path.join(__dirname, '..', '..', 'js');
for (const file of ['type-library.js', 'parser.js', 'netbox-matcher.js']) {
  const code = fs.readFileSync(path.join(jsDir, file), 'utf8').replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
  vm.runInContext(code, ctx, { filename: file });
}

const refData = JSON.parse(fs.readFileSync(path.join(__dirname, 'reference-data.json'), 'utf8'));

// Map fixture CSVs to locodes
const FIXTURE_LOCODE_MAP = {
  'evi01-overhead.csv': 'US-EVI01',
  // Add more as fixtures are created
};

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

const scorecard = { generated: new Date().toISOString(), sites: [], summary: {} };
let totalPass = 0, totalHalls = 0, totalExpected = 0, totalFound = 0;

for (const [csvFile, locode] of Object.entries(FIXTURE_LOCODE_MAP)) {
  const fixtPath = path.join(__dirname, '..', 'fixtures', csvFile);
  if (!fs.existsSync(fixtPath)) { console.warn(`Fixture not found: ${csvFile}`); continue; }

  const grid = loadCSV(csvFile);
  const parseResult = vm.runInContext('new LayoutParser(grid).parse()', Object.assign(ctx, { grid }));
  const refHalls = refData.halls.filter(h => h.locode === locode);

  if (refHalls.length === 0) { console.warn(`No reference data for ${locode}`); continue; }

  const siteResult = compareSite(parseResult, refHalls);
  scorecard.sites.push({ locode, fixture: csvFile, ...siteResult });

  totalPass += siteResult.pass_count;
  totalHalls += siteResult.total_halls;
  totalExpected += siteResult.total_expected;
  totalFound += siteResult.total_found;

  // Print site summary
  const icon = siteResult.pass_count === siteResult.total_halls ? '\x1b[32m✓\x1b[0m' : '\x1b[33m△\x1b[0m';
  console.log(`${icon} ${locode}: ${siteResult.pass_count}/${siteResult.total_halls} halls pass, ${siteResult.total_found}/${siteResult.total_expected} racks (${siteResult.site_accuracy}%)`);
  for (const h of siteResult.halls) {
    if (h.status !== 'PASS') {
      console.log(`    ${h.datahall}: ${h.found_racks}/${h.expected_racks} (delta ${h.delta > 0 ? '+' : ''}${h.delta}) — ${h.missing_count} missing, ${h.extra_count} extra`);
    }
  }
}

scorecard.summary = {
  halls_passed: totalPass,
  halls_total: totalHalls,
  hall_pass_rate: totalHalls > 0 ? Math.round(totalPass / totalHalls * 1000) / 10 : 0,
  racks_expected: totalExpected,
  racks_found: totalFound,
  rack_accuracy: totalExpected > 0 ? Math.round((1 - Math.abs(totalFound - totalExpected) / totalExpected) * 1000) / 10 : 0,
};

fs.writeFileSync(path.join(__dirname, 'scorecard.json'), JSON.stringify(scorecard, null, 2));
console.log(`\nScorecard: ${totalPass}/${totalHalls} halls pass, ${scorecard.summary.rack_accuracy}% rack accuracy`);
console.log(`Written to test/regression/scorecard.json`);
```

- [ ] **Step 2: Run the offline regression**

Run: `node test/regression/run-offline.js`
Expected: EVI01 results showing per-hall pass/fail and rack count delta

- [ ] **Step 3: Add npm script**

In `package.json`, add to `"scripts"`:
```json
"test:regression": "node test/regression/run-offline.js"
```

- [ ] **Step 4: Commit**

```bash
git add test/regression/run-offline.js package.json
git commit -m "feat: add offline regression runner — scorecard for parser vs overhead2svg"
```

---

## Chunk 3: Live Sheet Regression + Gap Analysis

### Task 5: Build the live sheet fetcher for regression

**Files:**
- Create: `test/regression/fetch-sheet.js`
- Create: `test/regression/run-live.js`

This fetches live overhead data from Google Sheets (same JSONP endpoint Blueprint Map uses in the browser) and runs the comparison against all matched sites.

- [ ] **Step 1: Write the sheet fetcher**

```javascript
// fetch-sheet.js — fetch a Google Sheet tab as CSV grid (Node.js)
// Uses the same Apps Script endpoint as Blueprint Map's browser client

const https = require('https');

const APPS_SCRIPT_URL = 'https://script.google.com/a/macros/coreweave.com/s/AKfycbw';
// NOTE: The full URL must be extracted from index.html's loadFromSheets()

function fetchSheet(sheetId, tab = 'OVERHEAD') {
  return new Promise((resolve, reject) => {
    // The Apps Script returns JSONP; we need to extract the JSON payload
    // For Node.js, we'll request with a callback param and strip the wrapper
    const callbackName = `cb${Date.now()}`;
    const url = `${APPS_SCRIPT_URL}?id=${sheetId}&tab=${encodeURIComponent(tab)}&callback=${callbackName}`;

    https.get(url, { headers: { 'User-Agent': 'BlueprintMap-Regression/1.0' } }, (res) => {
      let data = '';
      // Handle redirects (Apps Script uses 302)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          let d2 = '';
          res2.on('data', chunk => d2 += chunk);
          res2.on('end', () => {
            try {
              // Strip JSONP wrapper: callbackName(DATA)
              const jsonStr = d2.replace(new RegExp(`^${callbackName}\\(`), '').replace(/\);?\s*$/, '');
              resolve(JSON.parse(jsonStr));
            } catch (e) { reject(e); }
          });
        }).on('error', reject);
        return;
      }
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonStr = data.replace(new RegExp(`^${callbackName}\\(`), '').replace(/\);?\s*$/, '');
          resolve(JSON.parse(jsonStr));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

module.exports = { fetchSheet };
```

**NOTE:** The exact Apps Script URL must be extracted from `index.html`'s `loadFromSheets()` function. This is a CW-internal endpoint — it requires CW Google auth context. The live runner may need to be run from a browser context or with appropriate credentials. If the JSONP endpoint doesn't work from Node.js, fall back to saving CSVs manually from Blueprint Map's UI and adding them to `test/fixtures/`.

- [ ] **Step 2: Write the live batch runner**

Same structure as `run-offline.js` but uses `fetch-sheet.js` to pull live data, with rate limiting (1 request per 2 seconds to avoid Google quota).

- [ ] **Step 3: Test with one site**

Run: `node test/regression/run-live.js --site US-EVI01`
Expected: Live parse of EVI01 sheet, compared against reference data

- [ ] **Step 4: Commit**

```bash
git add test/regression/fetch-sheet.js test/regression/run-live.js
git commit -m "feat: add live sheet regression runner — fetches from Google Sheets API"
```

---

### Task 6: Analyze gaps and create targeted fixtures

**Files:**
- Create: `test/fixtures/` — new CSV fixtures for failing sites
- Modify: `test/regression/run-offline.js` — update FIXTURE_LOCODE_MAP
- Modify: `test/parser.test.js` — new test cases

This task is iterative. After running regression, identify the top failures and create test cases.

- [ ] **Step 1: Run regression and identify top 3 failures**

Run: `node test/regression/run-offline.js` (or `run-live.js` if available)
Examine `scorecard.json` for halls with `status: "DELTA"` or `"HALL_NOT_FOUND"`

- [ ] **Step 2: For each failure, download the CSV**

Open Blueprint Map in browser, load the failing site, use the CSV download feature to save the raw grid to `test/fixtures/{locode}-overhead.csv`.

- [ ] **Step 3: Write a targeted test case for each failure**

For each failure, add a test to `test/parser.test.js`:

```javascript
test('{locode}: rack count matches overhead2svg reference ({N} racks)', () => {
  const pr = parse('{locode}-overhead.csv');
  const hall = pr.halls.find(h => h.name.includes('{HALL_NAME}'));
  assert.ok(hall, 'Hall {HALL_NAME} not found');
  // Count racks through hierarchy
  let rackCount = 0;
  // ... traverse sections/blocks
  assert.strictEqual(rackCount, {EXPECTED}, `Expected {EXPECTED} racks, got ${rackCount}`);
});
```

- [ ] **Step 4: Run tests to confirm they fail (TDD red)**

Run: `npm test`
Expected: New tests FAIL — this confirms the parser has a real gap

- [ ] **Step 5: Commit the failing tests**

```bash
git add test/fixtures/*.csv test/parser.test.js
git commit -m "test: add regression fixtures for {sites} — exposes parser gaps"
```

---

## Chunk 4: Parser Improvements (Driven by Regression)

### Task 7: Fix parser issues identified by regression

**Files:**
- Modify: `js/parser.js` — targeted fixes
- Modify: `test/parser.test.js` — verify fixes

This task is repeated for each category of failure found in regression. Common expected failure modes based on architectural differences:

**Category A: Hall matching failures**
- overhead2svg uses SPLAT named ranges (`US_EVI01_DATAHALL_DH4`) to identify halls
- Blueprint Map uses header detection + spatial clustering
- Fix: Improve Pass 4 hall assignment to match named range conventions

**Category B: Rack count mismatches**
- overhead2svg counts racks as "gray cell + integer"
- Blueprint Map requires minimum run length (3+), which can miss isolated racks
- Fix: Tune `PARSER_CONFIG.minRunLength` or add recovery pass for orphaned racks

**Category C: Non-standard hall naming**
- overhead2svg handles `L1`, `U1`, `S2`, `N15S1`, `DH115`, `DH1000`, `DHA`
- Blueprint Map's `decodeDH()` may not parse these
- Fix: Extend `decodeDH()` and Pass 4 header matching

**Category D: Multi-floor/multi-building sites**
- Some sites have nested hierarchies (floors → halls)
- Blueprint Map may flatten these incorrectly
- Fix: Improve spatial clustering in Pass 3/4

- [ ] **Step 1: Diagnose the specific failure from scorecard.json**

Read the delta report. Identify whether the failure is Category A, B, C, or D.

- [ ] **Step 2: Write a minimal failing test targeting the root cause**

- [ ] **Step 3: Fix the parser (minimal change)**

- [ ] **Step 4: Run full test suite**

Run: `npm test && npm run test:regression`
Expected: New test passes, no existing tests regress

- [ ] **Step 5: Commit**

```bash
git add js/parser.js test/parser.test.js
git commit -m "fix: {specific fix description} — closes regression gap for {site}"
```

- [ ] **Repeat Steps 1-5 for each failure category**

---

### Task 8: Handle overhead2svg's 13 missing halls

**Files:**
- Modify: `js/parser.js` — if parser can handle these
- Create: `test/fixtures/` — fixtures for missing hall sites

The 13 halls that overhead2svg failed on are your competitive edge. If Blueprint Map can parse them, that's a measurable win.

Missing halls:
- `US_ATL2_DATAHALL_DH2`, `US_ATL2_DATAHALL_DH3` (ATL2 / DGV01)
- `US_EVI01_DATAHALL_DH4` (US-CENTRAL-07A / EVI01)
- `US_EWS01_DATAHALL_DH2`, `US_EWS01_DATAHALL_DH3` (US-EAST-02B / EWS01)
- `US_LAS01_DATAHALL_S2` (US-WEST-01A / LAS01)
- `US_LAS03_DATAHALL_S3`, `US_LAS03_DATAHALL_S0`, `US_LAS03_DATAHALL_N15S1` (US-WEST-01A / LAS03)
- `US_HIO03_DATAHALL_DH115`, `US_HIO03_DATAHALL_DH105`, `US_HIO03_DATAHALL_DH110` (US-WEST-06A / HIO03)
- `US_DTN01_DATAHALL_DHA` (US-CENTRAL-03A / DTN01)

- [ ] **Step 1: Load each site in Blueprint Map and check if the parser finds the missing halls**

- [ ] **Step 2: For halls Blueprint Map detects, add them to reference-data.json as "blueprint_map_only" entries**

- [ ] **Step 3: For halls neither tool detects, investigate the raw sheet to understand why**

- [ ] **Step 4: Document findings in test/regression/README.md**

- [ ] **Step 5: Commit**

```bash
git add test/regression/README.md test/regression/reference-data.json
git commit -m "docs: document overhead2svg missing halls — 13 edge cases analyzed"
```

---

## Chunk 5: Cache-First with Background Revalidation

### Task 9: Add stale-while-revalidate to reference data

**Files:**
- Create: `test/regression/cache.js`
- Modify: `test/regression/run-offline.js` — use cache layer
- Modify: `test/regression/extract-reference.js` — add content hash

The regression system should load cached `reference-data.json` instantly, then background-check if the overhead2svg repo has new SVGs or updated rack counts. If changes are found, prompt the user to update.

- [ ] **Step 1: Add content hash to reference data extraction**

Modify `extract-reference.js` to compute a SHA-256 hash of all SVG file contents and store it in `reference-data.json`:

```javascript
const crypto = require('crypto');

// After building reference.halls, compute a content fingerprint
const hasher = crypto.createHash('sha256');
for (const entry of mapping) {
  const svgPath = path.join(O2S_OUTPUT, entry.zone, `${entry.file_prefix}.svg`);
  if (fs.existsSync(svgPath)) {
    hasher.update(fs.readFileSync(svgPath));
  }
}
reference.contentHash = hasher.digest('hex').slice(0, 16);
```

- [ ] **Step 2: Write the cache validator**

```javascript
// cache.js — stale-while-revalidate for reference data
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REF_FILE = path.join(__dirname, 'reference-data.json');
const O2S_OUTPUT = path.join(__dirname, '..', '..', '..', 'overhead2svg', 'output');
const MAPPING_FILE = path.join(O2S_OUTPUT, 'data-hall-mapping.json');

function loadCached() {
  if (!fs.existsSync(REF_FILE)) return null;
  return JSON.parse(fs.readFileSync(REF_FILE, 'utf8'));
}

function computeCurrentHash() {
  if (!fs.existsSync(MAPPING_FILE)) return null;
  const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  const hasher = crypto.createHash('sha256');
  for (const entry of mapping) {
    const svgPath = path.join(O2S_OUTPUT, entry.zone, `${entry.file_prefix}.svg`);
    if (fs.existsSync(svgPath)) {
      hasher.update(fs.readFileSync(svgPath));
    }
  }
  return hasher.digest('hex').slice(0, 16);
}

function checkFreshness() {
  const cached = loadCached();
  if (!cached) return { status: 'NO_CACHE', message: 'No reference data found. Run extract-reference.js first.' };

  const currentHash = computeCurrentHash();
  if (!currentHash) return { status: 'NO_SOURCE', message: 'overhead2svg output not found. Clone the repo first.' };

  if (cached.contentHash === currentHash) {
    return { status: 'FRESH', message: 'Reference data is up to date.', data: cached };
  }

  // Count what changed
  const currentMapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  const cachedZones = new Set(cached.halls.map(h => `${h.zone}/${h.datahall}`));
  const currentZones = new Set(currentMapping.map(e => `${e.zone}/${e.datahall_name}`));
  const added = [...currentZones].filter(z => !cachedZones.has(z));
  const removed = [...cachedZones].filter(z => !currentZones.has(z));

  return {
    status: 'STALE',
    message: `Reference data is outdated. ${added.length} halls added, ${removed.length} removed.`,
    added,
    removed,
    cachedHash: cached.contentHash,
    currentHash,
    data: cached, // still return cached data for immediate use
  };
}

module.exports = { loadCached, computeCurrentHash, checkFreshness };
```

- [ ] **Step 3: Integrate cache layer into run-offline.js**

At the top of `run-offline.js`, replace the direct `JSON.parse(fs.readFileSync(...))` with:

```javascript
const { checkFreshness } = require('./cache');

const freshness = checkFreshness();
if (freshness.status === 'NO_CACHE') {
  console.error(freshness.message);
  process.exit(1);
}
if (freshness.status === 'STALE') {
  console.warn(`\x1b[33m⚠ ${freshness.message}\x1b[0m`);
  console.warn(`  Run: node test/regression/extract-reference.js to update`);
  if (freshness.added.length) console.warn(`  New halls: ${freshness.added.join(', ')}`);
  if (freshness.removed.length) console.warn(`  Removed: ${freshness.removed.join(', ')}`);
  console.warn('  Continuing with cached data...\n');
}

const refData = freshness.data;
```

This way: cached data loads instantly, staleness warning shows if overhead2svg was updated (e.g., after `git pull`), and the runner keeps working either way.

- [ ] **Step 4: Write test for cache layer**

```javascript
// test/regression/cache.test.js
const assert = require('assert');
const { checkFreshness } = require('./cache');

const result = checkFreshness();
assert.ok(['FRESH', 'STALE', 'NO_CACHE', 'NO_SOURCE'].includes(result.status));
if (result.data) {
  assert.ok(result.data.halls.length > 0);
  assert.ok(result.data.contentHash);
}
console.log(`  \x1b[32m✓\x1b[0m cache freshness check: ${result.status}`);
```

- [ ] **Step 5: Commit**

```bash
git add test/regression/cache.js test/regression/cache.test.js test/regression/extract-reference.js test/regression/run-offline.js
git commit -m "feat: add stale-while-revalidate cache — load instantly, warn if overhead2svg updated"
```

---

### Task 10: Add auto-pull check for overhead2svg repo

**Files:**
- Modify: `test/regression/cache.js` — add git remote check

- [ ] **Step 1: Add git remote freshness check**

Extend `checkFreshness()` to also check if the local overhead2svg clone is behind the remote:

```javascript
const { execSync } = require('child_process');

function checkRemote() {
  try {
    // Fetch without pulling (non-destructive)
    execSync('git fetch --dry-run', { cwd: O2S_OUTPUT, stdio: 'pipe', timeout: 10000 });
    const status = execSync('git status -uno', { cwd: O2S_OUTPUT, encoding: 'utf8', timeout: 5000 });
    if (status.includes('behind')) {
      const behindMatch = status.match(/(\d+) commits? behind/);
      return { behind: true, commits: behindMatch ? +behindMatch[1] : 0 };
    }
    return { behind: false };
  } catch {
    return { behind: null }; // network error, skip silently
  }
}
```

Integrate into `checkFreshness()`: if local is fresh but remote has updates, return status `'REMOTE_UPDATE'` with message suggesting `git -C ../overhead2svg pull && node extract-reference.js`.

- [ ] **Step 2: Test**

Run: `node test/regression/cache.test.js`
Expected: Reports either FRESH, STALE, or REMOTE_UPDATE

- [ ] **Step 3: Commit**

```bash
git add test/regression/cache.js
git commit -m "feat: add remote update detection — warns when overhead2svg has new commits"
```

---

## Execution Order

1. **Task 1** — Extract reference data (standalone, no deps)
2. **Task 2** — Build site map (depends on Task 1 output)
3. **Task 3** — Comparison engine (standalone logic)
4. **Task 4** — Offline runner (depends on Tasks 1-3)
5. **Task 5** — Live runner (depends on Tasks 1-4, optional — needs CW Google auth)
6. **Task 6** — Gap analysis (depends on Task 4 output)
7. **Task 7** — Parser fixes (depends on Task 6 findings, iterative)
8. **Task 8** — Missing hall analysis (can run in parallel with Task 7)
9. **Task 9** — Cache-first + background revalidation (depends on Task 1)
10. **Task 10** — Auto-pull check for overhead2svg remote (depends on Task 9)

**Critical path:** Tasks 1 → 2 → 3 → 4 → 6 → 7
**Cache path:** Tasks 1 → 9 → 10 (can run after Task 1, independent of comparison work)
**Optional/parallel:** Task 5 (live), Task 8 (missing halls)

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Sites with regression fixtures | 1 (EVI01) | 10+ |
| Hall pass rate vs overhead2svg | Unknown | >90% |
| Rack count accuracy vs reference | Unknown | >98% |
| overhead2svg missing halls parsed by Blueprint Map | Unknown | >5 of 13 |
| Automated regression in CI | No | Yes (`npm run test:regression`) |
