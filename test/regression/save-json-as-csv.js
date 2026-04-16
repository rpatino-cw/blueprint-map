#!/usr/bin/env node
// Convert Playwright-saved JSON sheet data to CSV fixture
// Usage: node save-json-as-csv.js <json-file> <locode>
const fs = require('fs');
const path = require('path');

const jsonFile = process.argv[2];
const locode = process.argv[3];
if (!jsonFile || !locode) { console.error('Usage: node save-json-as-csv.js <json-file> <locode>'); process.exit(1); }

let raw = fs.readFileSync(jsonFile, 'utf8');
if (raw.startsWith('"')) raw = JSON.parse(raw);
const data = JSON.parse(raw);

const csv = data.map(row =>
  row.map(cell => {
    const s = String(cell == null ? '' : cell);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',')
).join('\n');

const code = locode.toLowerCase().replace(/^(us|no|se|ca|dk|gb)-/, '');
const outFile = path.join(__dirname, '..', 'fixtures', `${code}-overhead.csv`);
fs.writeFileSync(outFile, csv);
console.log(`${locode}: ${data.length} rows -> ${outFile}`);
