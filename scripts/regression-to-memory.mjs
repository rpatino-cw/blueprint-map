#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const SCORECARD = join(REPO_ROOT, 'test/regression/scorecard.json');
const MEMORY_DIR = '/Users/rpatino/.claude/projects/-Users-rpatino/memory';
const MEMORY_INDEX = join(MEMORY_DIR, 'MEMORY.md');
const THRESHOLD = 80;

const scorecard = JSON.parse(readFileSync(SCORECARD, 'utf8'));
const sha = execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();

const failing = scorecard.sites.filter(s => s.site_accuracy < THRESHOLD);

if (failing.length === 0) {
  console.log('All sites >= 80% — no memory updates.');
  process.exit(0);
}

let indexContent = readFileSync(MEMORY_INDEX, 'utf8');
const indexLines = indexContent.split('\n');
let indexChanged = false;

for (const site of failing) {
  const slug = site.locode.toLowerCase().replace(/-/g, '_');
  const fileName = `blueprint_regression_${slug}.md`;
  const filePath = join(MEMORY_DIR, fileName);

  const hallLines = site.halls.map(h => {
    const miss = h.missing_racks?.length ? ` · missing: ${h.missing_racks.slice(0, 10).join(', ')}${h.missing_racks.length > 10 ? '…' : ''}` : '';
    const extra = h.extra_racks?.length ? ` · extra: ${h.extra_racks.slice(0, 10).join(', ')}${h.extra_racks.length > 10 ? '…' : ''}` : '';
    return `- **${h.datahall}** — ${h.found_racks}/${h.expected_racks} (${h.accuracy}%)${miss}${extra}`;
  }).join('\n');

  const body = `---
name: Blueprint regression ${site.locode}
description: Failing regression site (${site.site_accuracy}% hall accuracy) — auto-updated by scripts/regression-to-memory.mjs
type: project
---

**Locode:** ${site.locode}
**Fixture:** \`test/regression/fixtures/${site.fixture}\`
**Site accuracy:** ${site.site_accuracy}% (${site.pass_count}/${site.total_halls} halls passing)
**Rack totals:** ${site.total_found}/${site.total_expected} (delta ${site.total_delta})
**Parser total racks:** ${site.parser_total_racks} · flat delta ${site.flat_delta}
**Last run:** ${scorecard.generated}
**Git SHA:** ${sha}

## Halls

${hallLines}

## How to apply

Start parser debugging here when touching this site. If accuracy recovers, this file is still auto-updated on the next run; delete it manually once the site is green.
`;

  writeFileSync(filePath, body);
  console.log(`Wrote ${fileName}`);

  const indexPattern = new RegExp(`blueprint_regression_${slug}\\.md`);
  const existingLineIdx = indexLines.findIndex(l => indexPattern.test(l));
  const newLine = `- [Blueprint regression: ${site.locode}](${fileName}) — ${site.total_found}/${site.total_expected} racks (${site.site_accuracy}%) · fixture: ${site.fixture}`;

  if (existingLineIdx === -1) {
    indexLines.push(newLine);
    indexChanged = true;
    console.log(`  + index entry appended`);
  } else if (indexLines[existingLineIdx] !== newLine) {
    indexLines[existingLineIdx] = newLine;
    indexChanged = true;
    console.log(`  ~ index entry updated`);
  }
}

if (indexChanged) {
  writeFileSync(MEMORY_INDEX, indexLines.join('\n'));
  console.log(`Updated ${MEMORY_INDEX}`);
}

console.log(`Done. ${failing.length} failing site(s) synced to memory.`);
