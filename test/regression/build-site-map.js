#!/usr/bin/env node
// Generate site-map.json by matching reference locodes to Blueprint Map sheet IDs
// Usage: node test/regression/build-site-map.js

const fs = require('fs');
const path = require('path');

const INDEX_HTML = path.join(__dirname, '..', '..', 'index.html');
const REF_DATA = path.join(__dirname, 'reference-data.json');
const OUT_FILE = path.join(__dirname, 'site-map.json');

const html = fs.readFileSync(INDEX_HTML, 'utf8');
const ref = JSON.parse(fs.readFileSync(REF_DATA, 'utf8'));

// Extract sheet options: value="SHEET_ID">LABEL</option>
const optionPattern = /value="([^"]{20,})"[^>]*>([^<]+)/g;
const sheets = [];
let m;
while ((m = optionPattern.exec(html)) !== null) {
  const label = m[2].trim();
  const locodeMatch = label.match(/^(\w+)\s/);
  if (!locodeMatch) continue;
  const code = locodeMatch[1];

  // Determine country prefix from zone in parentheses
  const zoneMatch = label.match(/\((EU|CA|AU|GB|SE|NO|DK)-/);
  let prefix = 'US';
  if (zoneMatch) {
    if (code === 'FAN01') prefix = 'SE';
    else if (code === 'OVO01') prefix = 'NO';
    else if (code.startsWith('GAL')) prefix = 'CA';
    else if (code === 'CWY01' || code === 'PPL01') prefix = 'GB';
    else prefix = 'US';
  }
  sheets.push({ sheetId: m[1], label, rawCode: code, locode: `${prefix}-${code}` });
}

const refLocodes = [...new Set(ref.halls.map(h => h.locode))];
const siteMap = { generated: new Date().toISOString(), sites: [], unmatched_ref: [], unmatched_bp: [] };

for (const locode of refLocodes) {
  let sheet = sheets.find(s => s.locode === locode);
  // Fallback: match by raw code
  if (!sheet) {
    const code = locode.split('-').slice(1).join('-');
    sheet = sheets.find(s => s.rawCode === code);
  }

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

const matchedLocodes = new Set(siteMap.sites.map(s => s.locode));
for (const s of sheets) {
  if (!matchedLocodes.has(s.locode) && !refLocodes.includes(s.locode)) {
    siteMap.unmatched_bp.push({ locode: s.locode, label: s.label });
  }
}

console.log(`Matched: ${siteMap.sites.length} sites`);
console.log(`Unmatched (reference only): ${siteMap.unmatched_ref.length}`);
if (siteMap.unmatched_ref.length) console.log(`  ${siteMap.unmatched_ref.join(', ')}`);
console.log(`Unmatched (Blueprint Map only): ${siteMap.unmatched_bp.length}`);
if (siteMap.unmatched_bp.length) console.log(`  ${siteMap.unmatched_bp.map(s => s.locode).join(', ')}`);

fs.writeFileSync(OUT_FILE, JSON.stringify(siteMap, null, 2));
console.log(`\nSite map written to ${OUT_FILE}`);
