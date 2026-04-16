#!/usr/bin/env node
// Convert raw JSON sheet data to proper CSV files
// Usage: node fetch-sites.js <json-file> <locode>
// The JSON file should contain the raw array-of-arrays from the Apps Script endpoint

const fs = require('fs');
const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const ENDPOINT = 'https://script.google.com/a/macros/coreweave.com/s/AKfycbw_DYXJFneaL7C-6xP4L2XxvlJN9wm0sIEZZWC_aDEygfj5vFUPk98iDV4oUy8r45Bt/exec';

// Site map: locode -> sheetId
const siteMap = JSON.parse(fs.readFileSync(path.join(__dirname, 'site-map.json'), 'utf8'));

function jsonToCSV(data) {
  return data.map(row =>
    row.map(cell => {
      const s = String(cell == null ? '' : cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
}

// If called with a JSON file, convert it
if (process.argv[2] && process.argv[3]) {
  const jsonFile = process.argv[2];
  const locode = process.argv[3];
  const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
  const csv = jsonToCSV(data);
  const outFile = path.join(FIXTURES_DIR, `${locode.toLowerCase()}-overhead.csv`);
  fs.writeFileSync(outFile, csv);
  console.log(`Saved ${outFile} (${data.length} rows)`);
  process.exit(0);
}

// Otherwise, print URLs for all sites
console.log('Sheet URLs for batch download (open in authenticated browser):');
console.log('');
for (const site of siteMap.sites) {
  if (site.locode === 'US-EVI01') continue; // already have fixture
  const url = `${ENDPOINT}?id=${site.sheetId}&tab=OVERHEAD`;
  const filename = `${site.locode.toLowerCase().replace('us-', '').replace('no-', '').replace('se-', '').replace('ca-', '').replace('dk-', '')}-overhead.csv`;
  console.log(`${site.locode} (${site.label}):`);
  console.log(`  URL: ${url}`);
  console.log(`  Save as: test/fixtures/${filename}`);
  console.log('');
}
