<div align="center">
  <img src="assets/banner.svg" alt="Blueprint Map" width="700">

  <br>

  **For DCTs who read CSV overheads and see racks, not cells.**

  Browser app that turns datacenter overhead spreadsheets into zoomable visual floor maps. Drop a CSV, get a blueprint.

  [![License](https://img.shields.io/github/license/rpatino-cw/blueprint-map?style=flat-square)](LICENSE)
  [![Issues](https://img.shields.io/github/issues/rpatino-cw/blueprint-map?style=flat-square)](https://github.com/rpatino-cw/blueprint-map/issues)
  [![Tests](https://img.shields.io/github/actions/workflow/status/rpatino-cw/blueprint-map/test.yml?style=flat-square&label=tests)](https://github.com/rpatino-cw/blueprint-map/actions)
  [![Deploy](https://img.shields.io/github/deployments/rpatino-cw/blueprint-map/github-pages?style=flat-square&label=live)](https://rpatino-cw.github.io/blueprint-map/)
</div>

<br>

<div align="center">
  <img src="assets/demo.gif" alt="Blueprint Map demo — drop CSV, get visual map" width="700">
</div>

---

## Try it

1. Open [**Blueprint Map**](https://rpatino-cw.github.io/blueprint-map/)
2. Drop your overhead `.csv` onto the drop zone

That's it. Map renders in seconds. No install, no build step.

```bash
# Or run locally
git clone https://github.com/rpatino-cw/blueprint-map.git
cd blueprint-map
open index.html
```

---

## What it does

- **Visualize** overhead layout CSVs as zoomable, color-coded blueprints
- **40+ CW sites built in** — dropdown selector loads live from Google Sheets (US Central, US East, US West, Europe)
- **Auto-detect** rack types, halls, grids, pods, and serpentine numbering with a 7-pass parser
- **38 rack type categories** — bucket-indexed prefix matching with unsupervised discovery for unknown types
- **Spatial hall inference** — clusters sections by column distance when sheets lack standard hall headers
- **Fast CSV parsing** — PapaParse with Web Worker support for large files (>500KB), auto-detects delimiters
- **Per-pass timing** — performance profiling logged to console for every parse
- **Export** publication-ready SVG, 2x PNG, and PDF
- **AI-assisted** (optional) — Claude Haiku identifies structure in messy spreadsheets
- **Offline fallback** — built-in CSV parser activates when CDN is unavailable

---

## The Parser

<img src="assets/demo-flow.svg" alt="CSV to visual map pipeline" width="700">

A 7-pass structural analysis engine that reads raw CSV overhead grids and understands every cell — rack numbers, rack types, hall boundaries, grid labels, SPLAT ranges, power annotations, stat rows, and metadata. No configuration. No AI required. Drop a CSV, it figures it out.

### By the numbers

| Metric | Value |
|--------|-------|
| **Rack capture** | 100% — verified across 40 live sites (54 to 3,380 racks each) |
| **Cell understanding** | 99.6% — every cell classified; only 4-digit stat values fall through |
| **Type recognition** | 38 built-in categories + unsupervised discovery for unknown hardware |
| **Parse speed** | <40ms for the largest site (3,380 racks, 104 rows, 189 columns) |
| **Sheet formats** | Old (Albatross flat), new (v2.0 campus/SPLAT), EU, legacy — all handled |
| **Hall detection** | 3 strategies: header-based, spatial inference, layout fallback |
| **Serpentine** | Auto-pairs ascending/descending rows, validates 20-rack pod structure |
| **Self-healing** | Pass 2.5 discovers unknown rack types at runtime by frequency analysis |

### What it understands

Every non-empty cell gets one of these classifications:

| Classification | Examples |
|----------------|----------|
| `rack-num` | `1`, `20`, `150`, `440` |
| `rack-type` | `HD-B2c`, `NVL72-v1`, `T1-E-v3b`, `IB x16`, `XDR x8a` |
| `hall-header` | `US-DTN01 NORTH CAMPUS BUILDING E`, `DH1`, `DH201` |
| `site-header` | `US-EVI01`, `ORD3-ALBATROSS`, `GB-PPL01` |
| `grid-label` | `GRID-A POD A1`, `GRID-GROUP 1`, `ROWS 1-10` |
| `splat` | `SPLAT_US_LZL01_DH201_GG1_A_A1_1_SP1` |
| `col-header` | `ROW`, `TYPE`, `PWR` |
| `row-label` | `B1`, `B2`, `C1` |
| `annotation` | `150kW`, `334kW`, `8 MegaWatts`, `*** COREWEAVE RESERVED ***` |
| `stat` | `Node Count: 320`, `GPU Count: 2560`, `Total Racks: 80` |
| `superpod` | `SP1`, `SP2` |
| `rack-type` (FDP) | `FDP-B1`, `FDP-W2`, `FDP-B2` |

### Validated against NetBox

Parser output was compared against the NetBox DCIM API for 13 sites. The parser finds equal or more racks than NetBox in every case — because overhead sheets include planned and reserved capacity that NetBox doesn't track until hardware arrives. **Zero missed racks.**

### The 7 passes

| Pass | Name | What it does |
|------|------|-------------|
| 1 | **Classify** | Label every cell: rack number, rack type, hall header, grid label, SPLAT range, annotation, stat/metadata. Detects site codes (`US-`, `GB-`, `SE-`, etc.), campus naming (`NORTH CAMPUS BUILDING E`), DH-style headers, power annotations, email/sharing metadata. |
| 1.5a | **Merge** | Combine multi-cell grid labels (e.g. "GRID-GROUP 1" spanning 3 merged columns). Parse structured fields: grid letter, grid-group number, pod label. |
| 1.5b | **Patterns** | Statistical row analysis — identify rack number rows by contiguous integer runs (3+ cells, 50%+ of row). Detect adjacent type rows by repeated text values. |
| 2 | **Detect** | Find contiguous rack blocks, pair ascending/descending rows as serpentine partners, extract row labels. Tag 20-rack pod pairs with corner rack validation. |
| 2.5 | **Discover** | Unsupervised type discovery — find repeated unknown values adjacent to rack blocks, register as new type categories at runtime. Self-healing: new hardware shows up in a sheet, the parser learns it automatically. |
| 3 | **Group** | Cluster blocks into sections by column alignment (±2 col tolerance). Split on 4+ empty rows, grid label boundaries, or rack number resets. Apply pod=20 heuristic. |
| 4 | **Assign** | Build hierarchy: sections → pods → grids → halls. Three strategies (in order): **1)** Header-based — match sections to DH/BUILDING headers by column overlap. **2)** Spatial inference — cluster sections by column distance (gap >= 8 cols = separate hall). **3)** Layout fallback — group all sections as one. |

Each pass is independently timed via `performance.now()` — timing data is included in the parse result and logged to `console.table()`.

### Frozen & protected

The parser is locked at v1.0 (`parser-v1.0-frozen` tag). A pre-commit hook runs all 47 tests automatically before any change to `parser.js` or `type-library.js` can be committed. If tests fail, the commit is blocked. Restore anytime:

```bash
git checkout parser-v1.0-frozen -- js/parser.js js/type-library.js
```

---

## Views

| View | Description |
|------|-------------|
| **Grid** | 1:1 cell layout — every cell from the original CSV, color-coded by classification |
| **Structured** | Clean rack diagram grouped by hall, grid, and pod. Serpentine arrows, corner badges, type fills |

<img src="assets/grid-view.png" alt="Grid view — color-coded cells from CSV" width="700">

<img src="assets/structured-view.png" alt="Structured view — grouped by hall, grid, pod" width="700">

---

## Export

- **SVG** — vector output, scales to any size, perfect for printing or embedding in docs
- **PNG** — 2x resolution bitmap, ready to paste in Slack, Jira, or Confluence

---

## AI (optional)

Paste your Anthropic API key in the sidebar. Blueprint Map sends a small sample of your CSV to Claude Haiku to detect halls, rack rows, and custom device types. Results are cached by CSV hash — same file never hits the API twice.

No key? No problem. The rule-based 6-pass parser handles standard overhead formats on its own.

---

## Rack types

38 built-in rack type categories with bucket-indexed prefix matching. Prefixes are grouped by first 1-3 characters into a hash map — `match()` does O(1) bucket lookup then scans ~3 candidates, not ~100+ linear.

| Category | Prefixes | Notes |
|----------|----------|-------|
| Compute | `HD-B2`, `HD-B3`, `HD-GB`, `HD-H1`, `H1 x`, `H2 x`, `NV-CPU` | HGX, standard compute |
| NVL72 / GB200 | `NVL72`, `NVL36`, `B200-v`, `B200-SC` | GB200 NVL72 racks |
| GH200 | `GH2 x`, `GH200` | Grace Hopper |
| B4 / B100 | `B4 x` | Blackwell B100 |
| Inference | `L4 x`, `A1 x` | L4, A1 inference |
| TOR+IB Combo | `T0+IB`, `T0+XDR`, `T1+XDR` | Combined TOR + fabric |
| TOR / Edge | `T0-E`, `T1-E`, `T2-E`, `T3-E`, `T1 x`, `T2 x`, `T3 x` | All TOR switch variants |
| IB Spine | `IB x`, `IB-` | InfiniBand |
| XDR Spine | `XDR` | XDR fabric |
| BFR / WSR | `BFR-`, `WSR-` | RoCE fabric switches |
| Core / Spine | `CP`, `C-C`, `C-1`, `C-A`, `C-B` | Core switches |
| Frontend | `T0-FE`, `T1-FE`, `T2-FE` | Frontend switches |
| Storage | `V x`, `VAST`, `STRG`, `DDN` | All storage |
| PSDR | `PSDR`, `W/PSDR`, `W/PS-DR`, `W-PSDR` | Power distribution |
| Security | `MS-SEC`, `MS-WAN`, `CW-SEC`, `SEC` | Security appliances |
| Management | `R-MGMT`, `BE-MGMT`, `IT-CORE`, `mgmt-core` | Management |
| Reserved | `RES` | Reserved positions |
| Unallocated | `U` (with digit/space guard) | Empty racks |
| ... | + 20 more categories | FDP, DPR, PSCR, Ring, RoCE, Ethernet, Firewall, Console, etc. |

Unknown types are auto-discovered via frequency analysis in Pass 2.5 and registered at runtime.

---

## Testing

47 tests covering all 6 parser passes. Zero dependencies — runs in Node.js using the `vm` module.

```bash
npm test
```

Tests run on Node 18, 20, and 22 via GitHub Actions on every push and PR.

| Suite | Tests | Coverage |
|-------|-------|----------|
| TypeLibrary | 16 | Prefix matching, single-char guard, all categories |
| Helpers | 7 | `decodeDH`, `parseSPLAT` (frontend, RoCE, overflow) |
| Pass 1 | 10 | Hall headers, campus naming, ROWS labels, rack types |
| Pass 2 | 3 | Serpentine detection, multi-type blocks, rack counts |
| Pass 2.5 | 1 | Type category discovery |
| Pass 3 | 2 | Section grouping, block containment |
| Pass 4 | 5 | Hall assignment, SPLAT ranges, grid labels |
| Result | 3 | Field completeness, rack count integrity |

---

## File structure

```
index.html              ← app shell + cache-busted script loader
css/style.css           ← CoreWeave-branded dark theme with animations
js/
  type-library.js       ← 38 rack type categories + bucket-indexed prefix matching
  parser.js             ← 7-pass layout analysis engine (~1,230 lines, per-pass timing)
  renderer.js           ← SVG grid + structured view rendering
  ai.js                 ← Claude API integration + response caching
  app.js                ← state management, PapaParse CSV parsing, UI events
test/
  parser.test.js        ← 47 parser tests (Node.js, zero deps)
  fixtures/             ← anonymized CSV test fixtures
assets/                 ← banner, diagrams, screenshots
.github/workflows/
  test.yml              ← CI: run tests on Node 18/20/22
  bump-version.yml      ← auto-bump cache-bust version on deploy
```

---

## Contributing

Fork it, PR it, no real site data. Keep it simple.

[MIT](LICENSE)
