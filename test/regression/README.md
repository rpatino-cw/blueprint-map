# Parser Regression System

Automated comparison of Blueprint Map parser output against ground truth rack data across 107 data halls and 44 CW sites.

## Quick Start

```bash
# Run regression (uses local CSV fixtures)
npm run test:regression

# Rebuild reference data from SVG source
node test/regression/extract-reference.js --source <path-to-svg-dir>

# Rebuild site map (matches locodes to sheet IDs)
node test/regression/build-site-map.js
```

## How It Works

1. **reference-data.json** — Ground truth: rack counts, labels, and hostnames per hall (107 halls, 25,429 racks)
2. **site-map.json** — Maps reference locodes to Blueprint Map Google Sheet IDs (24 matched sites)
3. **compare.js** — Comparison engine: matches parser halls to reference halls, computes rack deltas
4. **run-offline.js** — Batch runner: parses CSV fixtures, compares against reference, outputs scorecard

## Metrics

- **Hall-level accuracy** — Do racks land in the correct hall? Measures Pass 4 hierarchy assignment.
- **Flat accuracy** — Does the parser find the right total rack count? Measures Pass 1-2 detection.
- **Hall pass rate** — How many halls have exact rack count matches?

## Adding Fixtures

1. Open Blueprint Map in browser, load a site, download the CSV
2. Save to `test/fixtures/{locode}-overhead.csv`
3. Add entry to `FIXTURE_MAP` in `run-offline.js`:
   ```js
   '{locode}-overhead.csv': 'US-{LOCODE}',
   ```
4. Run `npm run test:regression`

## Files

| File | Purpose |
|------|---------|
| `reference-data.json` | Ground truth (generated, do not edit) |
| `site-map.json` | Locode → Sheet ID mapping (generated + manual edits) |
| `compare.js` | Comparison engine module |
| `run-offline.js` | Batch regression runner |
| `scorecard.json` | Latest regression results (generated) |
| `extract-reference.js` | One-time SVG data extractor |
| `build-site-map.js` | Site map generator |
