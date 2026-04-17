#!/usr/bin/env node
// Site-mapping audit — loads the app, clears cache, waits for preload,
// and compares each dropdown LOCODE against the actual content of its
// Google Sheet. Fails if more sites mismatch than the baseline allows.
//
// Why: NetBox's sheetId field can drift from the spreadsheet it points to.
// The preload cache silently hides this because most users never see past
// their default site. This gate catches future regressions.
//
// Google Apps Script requires a CoreWeave-authenticated browser. On first
// run the script opens a non-headless window pointed at an isolated profile
// dir; sign in once, close the browser, and rerun — subsequent runs reuse
// the saved session.
//
// Usage:
//   node test/audit-sites.mjs                  # compare against baseline
//   node test/audit-sites.mjs --update-baseline
//   AUDIT_WAIT_MS=180000 node test/audit-sites.mjs
//   AUDIT_HEADLESS=1 node test/audit-sites.mjs  # CI mode (cannot auth)

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.AUDIT_PORT) || 8767;
const WAIT_MS = Number(process.env.AUDIT_WAIT_MS) || 120_000;
const BASELINE = path.join(__dirname, 'audit-sites.baseline.json');
const PROFILE_DIR = process.env.AUDIT_PROFILE || path.join(os.homedir(), '.blueprint-map-audit-profile');
const UPDATE = process.argv.includes('--update-baseline');
const HEADLESS = process.env.AUDIT_HEADLESS === '1';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv',
};

function serve() {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const p = path.normalize(path.join(ROOT, url));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(p, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

async function launch() {
  if (HEADLESS) {
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    return { ctx, close: () => browser.close() };
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false });
  return { ctx, close: () => ctx.close() };
}

async function main() {
  const server = serve();
  const { ctx, close } = await launch();
  const page = ctx.pages()[0] || await ctx.newPage();

  const jsonpErrors = [];
  page.on('pageerror', e => {
    const msg = String(e);
    if (/_bpSheet\d+/.test(msg)) jsonpErrors.push(msg);
  });

  try {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 15000 });

    await page.evaluate(() => {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('bp_sheet_')) localStorage.removeItem(k);
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const prefetchDone = page.waitForEvent('console', {
      predicate: m => m.text().includes('Prefetch done'),
      timeout: WAIT_MS,
    }).then(() => true).catch(() => false);

    console.log(`Waiting up to ${WAIT_MS / 1000}s for preload to settle…`);
    const settled = await prefetchDone;
    console.log(settled ? 'Preload reported done.' : 'Preload timed out — auditing what cached so far.');

    const result = await page.evaluate(() => {
      const select = document.getElementById('sheet-site');
      const options = [...select.options]
        .filter(o => o.value && !/TEMPLATE/i.test(o.textContent))
        .map(o => ({
          locode: o.textContent.trim().split(' — ')[0].trim(),
          sheetId: o.value,
        }));

      const knownLocodes = new Set(options.map(o => o.locode.toUpperCase()));
      options.forEach(o => {
        const m = o.locode.match(/-([A-Z0-9]+[A-Z]?)$/i);
        if (m) knownLocodes.add(m[1].toUpperCase());
      });

      const extractSiteCode = (csv) => {
        if (!csv) return null;
        const rows = csv.split('\n').slice(0, 30);
        const counts = new Map();
        for (const row of rows) {
          for (let cell of row.split(',')) {
            cell = cell.replace(/^"|"$/g, '').split('\n')[0].trim().toUpperCase();
            if (cell.length < 3 || cell.length > 25) continue;
            if (knownLocodes.has(cell)) counts.set(cell, (counts.get(cell) || 0) + 1);
          }
        }
        if (!counts.size) return null;
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };

      return options.map(o => {
        const raw = localStorage.getItem('bp_sheet_' + o.sheetId + '_OVERHEAD');
        if (!raw) return { ...o, cached: false, actualCode: null };
        try {
          const { csv } = JSON.parse(raw);
          return { ...o, cached: true, actualCode: extractSiteCode(csv) };
        } catch { return { ...o, cached: true, actualCode: null }; }
      });
    });

    const matches = [], mismatches = [], unknown = [], uncached = [];
    for (const r of result) {
      if (!r.cached) { uncached.push(r); continue; }
      if (!r.actualCode) { unknown.push(r); continue; }
      const loc = r.locode.toUpperCase(), act = r.actualCode.toUpperCase();
      if (loc === act || loc.endsWith('-' + act) || act.endsWith('-' + loc)) matches.push(r);
      else mismatches.push(r);
    }

    const report = {
      generatedAt: new Date().toISOString(),
      total: result.length,
      cached: result.length - uncached.length,
      matches: matches.length,
      mismatchCount: mismatches.length,
      unknownCount: unknown.length,
      uncachedCount: uncached.length,
      jsonpErrorCount: jsonpErrors.length,
      mismatches: mismatches.map(r => ({ locode: r.locode, actual: r.actualCode })),
      uncached: uncached.map(r => r.locode),
      unknown: unknown.map(r => r.locode),
    };

    console.log('\nAudit report:');
    console.log(JSON.stringify(report, null, 2));

    if (UPDATE) {
      const baseline = {
        generatedAt: report.generatedAt,
        maxMismatches: report.mismatchCount,
        knownMismatches: report.mismatches.map(m => m.locode).sort(),
        minCached: Math.max(0, Math.floor(report.cached * 0.9)),
      };
      fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
      console.log(`\nBaseline written to ${BASELINE}`);
      return 0;
    }

    if (report.cached === 0 && !HEADLESS) {
      console.error(`\n✗ 0 sites cached. Sign in to Google at the opened browser, close it, rerun.`);
      console.error(`  Profile dir: ${PROFILE_DIR}`);
      return 1;
    }
    if (!fs.existsSync(BASELINE)) {
      console.error(`\nNo baseline. Run with --update-baseline to create one.`);
      return 1;
    }
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const known = new Set(baseline.knownMismatches || []);
    const newMismatches = report.mismatches.filter(m => !known.has(m.locode));

    let failed = false;
    if (jsonpErrors.length) {
      console.error(`\n✗ JSONP callback errors detected (${jsonpErrors.length}). Collision fix regressed.`);
      failed = true;
    }
    if (report.cached < (baseline.minCached || 0)) {
      console.error(`\n✗ Only ${report.cached} sites cached, baseline expects >= ${baseline.minCached}.`);
      failed = true;
    }
    if (report.mismatchCount > baseline.maxMismatches) {
      console.error(`\n✗ Mismatches: ${report.mismatchCount} > baseline ${baseline.maxMismatches}.`);
      failed = true;
    }
    if (newMismatches.length) {
      console.error(`\n✗ New LOCODE mismatches not in baseline:`);
      for (const m of newMismatches) console.error(`    ${m.locode} → sheet contains ${m.actual}`);
      failed = true;
    }

    if (failed) return 1;
    console.log(`\n✓ Audit passed. ${matches.length}/${report.cached} cached sites match; ${mismatches.length} known mismatches.`);
    return 0;
  } finally {
    await close();
    server.close();
  }
}

main().then(code => process.exit(code)).catch(err => { console.error(err); process.exit(2); });
