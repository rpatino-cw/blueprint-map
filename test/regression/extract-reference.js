#!/usr/bin/env node
// Extract rack reference data from SVG floor plans
// One-time script to build reference-data.json ground truth
// Usage: node test/regression/extract-reference.js --source <path-to-svg-output>

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const srcIdx = args.indexOf('--source');
const SVG_SOURCE = srcIdx >= 0 ? args[srcIdx + 1] : path.join(__dirname, '..', '..', '..', 'overhead2svg', 'output');
const OUT_FILE = path.join(__dirname, 'reference-data.json');

const MAPPING_FILE = path.join(SVG_SOURCE, 'data-hall-mapping.json');
const MISSING_FILE = path.join(SVG_SOURCE, 'data-hall-missing.json');

if (!fs.existsSync(MAPPING_FILE)) {
  console.error(`Source mapping not found at ${MAPPING_FILE}`);
  console.error('Usage: node extract-reference.js --source <path-to-svg-directory>');
  process.exit(1);
}

const mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
const missing = fs.existsSync(MISSING_FILE) ? JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8')) : [];

const reference = { generated: new Date().toISOString(), contentHash: null, halls: [], missing: [], stats: {} };
const hasher = crypto.createHash('sha256');

for (const entry of mapping) {
  const svgPath = path.join(SVG_SOURCE, entry.zone, `${entry.file_prefix}.svg`);
  if (!fs.existsSync(svgPath)) {
    reference.missing.push({ ...entry, reason: 'svg_not_found' });
    continue;
  }

  const svg = fs.readFileSync(svgPath, 'utf8');
  hasher.update(svg);

  const rackPattern = /<g\s+id="(rack-\d+)"\s+data-label="(\d+)">/g;
  const racks = [];
  let m;
  while ((m = rackPattern.exec(svg)) !== null) {
    racks.push({ id: m[1], label: +m[2] });
  }

  const titlePattern = /<g\s+data-cell-id="(rack-\d+)"[\s\S]*?<title>([^<]*)<\/title>/g;
  const hostnames = {};
  while ((m = titlePattern.exec(svg)) !== null) {
    hostnames[m[1]] = m[2];
  }
  for (const rack of racks) {
    rack.hostname = hostnames[rack.id] || null;
  }

  const vbMatch = svg.match(/viewBox="([^"]+)"/);

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
    viewBox: vbMatch ? vbMatch[1] : null,
  });
}

for (const m of missing) {
  reference.missing.push({ ...m, reason: 'source_parse_failed' });
}

reference.contentHash = hasher.digest('hex').slice(0, 16);

reference.stats = {
  total_halls: reference.halls.length,
  total_racks: reference.halls.reduce((s, h) => s + h.extracted_rack_count, 0),
  total_missing: reference.missing.length,
  zones: [...new Set(reference.halls.map(h => h.zone))].length,
  locodes: [...new Set(reference.halls.map(h => h.locode))].length,
};

let mismatches = 0;
for (const h of reference.halls) {
  if (!h.rack_count_match) {
    console.warn(`  MISMATCH: ${h.zone}/${h.datahall} — expected ${h.expected_rack_count}, extracted ${h.extracted_rack_count}`);
    mismatches++;
  }
}

fs.writeFileSync(OUT_FILE, JSON.stringify(reference, null, 2));
console.log(`Reference data written to ${OUT_FILE}`);
console.log(`  Halls: ${reference.stats.total_halls}`);
console.log(`  Racks: ${reference.stats.total_racks}`);
console.log(`  Missing: ${reference.stats.total_missing}`);
console.log(`  Zones: ${reference.stats.zones}`);
console.log(`  Locodes: ${reference.stats.locodes}`);
console.log(`  Content hash: ${reference.contentHash}`);
console.log(`  Rack count mismatches: ${mismatches}/${reference.stats.total_halls}`);
