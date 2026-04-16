#!/usr/bin/env node
const fs = require('fs');
const raw = fs.readFileSync('test/fixtures/evi01-overhead.csv', 'utf8');

// Naive split
const naiveRows = raw.split('\n').length;

// Proper multiline-aware count
let properRows = 0, inQ = false;
for (let i = 0; i < raw.length; i++) {
  if (raw[i] === '"') inQ = !inQ;
  if (raw[i] === '\n' && !inQ) properRows++;
}
properRows++;

console.log('Naive split rows:', naiveRows);
console.log('Proper CSV rows:', properRows);
console.log('Difference:', naiveRows - properRows, 'extra rows from broken multiline cells');

// Show what a proper parser sees for row 3 (the DH header row)
const lines = [];
let line = '', q = false;
for (let i = 0; i < raw.length; i++) {
  const ch = raw[i];
  if (ch === '"') { q = !q; line += ch; continue; }
  if (ch === '\n' && !q) { lines.push(line); line = ''; continue; }
  if (ch === '\r') continue;
  line += ch;
}
if (line) lines.push(line);

console.log('\nProper row 3 (first 300 chars):');
console.log(lines[2]?.substring(0, 300));
console.log('\nProper row 3 cells with content:');
// Parse cells from the proper row
const row3 = lines[2] || '';
const cells = []; let cell = '', iq = false;
for (let i = 0; i < row3.length; i++) {
  const ch = row3[i];
  if (ch === '"') { iq = !iq; continue; }
  if (ch === ',' && !iq) { cells.push(cell); cell = ''; continue; }
  cell += ch;
}
cells.push(cell);

for (let c = 0; c < cells.length; c++) {
  if (cells[c].trim()) {
    console.log(`  col ${c}: "${cells[c].substring(0, 80).replace(/\n/g, '\\n')}"`);
  }
}
