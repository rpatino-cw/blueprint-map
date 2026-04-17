#!/usr/bin/env node
// Perf regression gate — drives the app via Playwright + Chromium
// to confirm site switching / ingest / render stay fast (AI on + AI cache cleared).
// Fails the build if any measurement breaches its budget.

const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); } catch (_) {
  console.log('Perf test skipped: playwright not installed.');
  console.log('Enable with: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const PORT = 8767;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv' };

const BUDGETS = {
  firstLoad_small: 150,
  firstLoad_big: 250,
  switch: 200,
  return: 200,
  dedup: 60,
  renderAll: 200,
};

function serve() {
  return http.createServer((req, res) => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(p, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

async function main() {
  const server = serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ bypassCSP: true });
  const page = await ctx.newPage();
  const fails = [];
  const rows = [];

  try {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof ingest === 'function' && typeof AI !== 'undefined' && AI.getCachedHints, { timeout: 10000 });

    const m = await page.evaluate(async () => {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('bp_ai_cache_') || k.startsWith('bp_hints_')) localStorage.removeItem(k); });
      const cb = document.getElementById('ai-enabled');
      if (cb && !cb.checked) cb.checked = true;

      const [vo, dtn] = await Promise.all([
        fetch('/test/fixtures/vo201-overhead.csv').then(r => r.text()),
        fetch('/test/fixtures/dtn01-overhead.csv').then(r => r.text()),
      ]);

      const results = {};
      let t = performance.now(); await ingest(vo);  results.firstLoad_small = performance.now() - t;
      t = performance.now(); await ingest(dtn);     results.firstLoad_big = performance.now() - t;
      t = performance.now(); await ingest(vo);      results.switch = performance.now() - t;
      t = performance.now(); await ingest(dtn);     results.return = performance.now() - t;
      t = performance.now(); await ingest(dtn);     results.dedup = performance.now() - t;

      state.hallFilter = '__all';
      t = performance.now(); renderAll(); results.renderAll = performance.now() - t;

      return Object.fromEntries(Object.entries(results).map(([k, v]) => [k, +v.toFixed(1)]));
    });

    for (const [name, ms] of Object.entries(m)) {
      const budget = BUDGETS[name];
      const status = ms <= budget ? 'ok  ' : 'FAIL';
      rows.push({ name, ms, budget });
      if (ms > budget) fails.push({ name, ms, budget });
      console.log(`${status} ${name.padEnd(20)} ${ms}ms (budget ${budget}ms)`);
    }
  } catch (err) {
    console.error('ERROR:', err.message);
    fails.push({ name: 'unhandled', ms: null, budget: null, err: err.message });
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${fails.length === 0 ? 'PASS' : 'FAIL'}: ${rows.length - fails.length}/${rows.length} within budget`);
  process.exit(fails.length > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
