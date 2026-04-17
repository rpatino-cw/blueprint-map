#!/usr/bin/env node
// Playwright smoke test — catches UI regressions the Node-only tests miss.
// Loads a multi-hall fixture and asserts the first-hall pill is active (not "All").
// This is the exact race condition that slipped through until 2026-04-16.
//
// Install once: npm i -D playwright && npx playwright install chromium
// Run:          npm run test:smoke

const http = require('http');
const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.log('Smoke test skipped: playwright not installed.');
  console.log('Enable with: npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const PORT = 8766;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv',
};

function serve() {
  return http.createServer((req, res) => {
    const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(p, 'index.html');
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
    fs.createReadStream(file).pipe(res);
  }).listen(PORT);
}

async function main() {
  const server = serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const results = [];
  const fail = (msg) => results.push({ pass: false, msg });
  const ok = (msg) => results.push({ pass: true, msg });

  try {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForFunction(() => typeof ingest === 'function' && typeof LayoutParser !== 'undefined', { timeout: 10000 });

    const evi01 = await page.evaluate(async () => {
      const csv = await fetch('/test/fixtures/evi01-overhead.csv').then(r => r.text());
      await ingest(csv);
      await new Promise(r => setTimeout(r, 400));
      const pills = [...document.querySelectorAll('.hall-pill')].map(p => ({ name: p.textContent.trim(), active: p.classList.contains('active') }));
      return { pills, filter: (typeof state !== 'undefined' ? state : null)?.hallFilter, selectValue: document.getElementById('hall-select')?.value };
    });

    const active = evi01.pills.find(p => p.active);
    if (!active) fail('EVI01: no pill is active after load');
    else if (active.name === 'All') fail('EVI01: "All" pill active — auto-focus regressed');
    else ok(`EVI01: first-hall pill "${active.name}" active`);

    if (evi01.filter === '__all') fail(`EVI01: state.hallFilter is __all, expected a hall name`);
    else ok(`EVI01: state.hallFilter = ${evi01.filter}`);

    if (evi01.selectValue !== evi01.filter) fail(`EVI01: <select> value ${evi01.selectValue} != state.hallFilter ${evi01.filter}`);
    else ok('EVI01: <select> in sync with state.hallFilter');

    const hallBounds = await page.evaluate(() => (typeof state !== 'undefined' ? state : null)?.hallBounds?.map(b => ({ name: b.name, left: Math.round(b.x), right: Math.round(b.x + b.w) })));

    const vo201 = await page.evaluate(async () => {
      const csv = await fetch('/test/fixtures/vo201-overhead.csv').then(r => r.text());
      await ingest(csv);
      await new Promise(r => setTimeout(r, 400));
      return { totalRacks: (typeof state !== 'undefined' ? state : null)?.parseResult?.totalRacks, halls: (typeof state !== 'undefined' ? state : null)?.parseResult?.halls?.length };
    });

    if (vo201.totalRacks !== 560) fail(`VO201: totalRacks ${vo201.totalRacks}, expected 560`);
    else ok('VO201: renders 560 racks');
    if (vo201.halls !== 1) fail(`VO201: ${vo201.halls} halls, expected 1`);
    else ok('VO201: renders 1 hall');

    const allPillTest = await page.evaluate(async () => {
      const csv = await fetch('/test/fixtures/evi01-overhead.csv').then(r => r.text());
      await ingest(csv);
      await new Promise(r => setTimeout(r, 300));
      const pill = [...document.querySelectorAll('.hall-pill')].find(p => p.dataset.hall === '__all');
      if (!pill) return { err: 'no All pill' };
      pill.click();
      await new Promise(r => setTimeout(r, 300));
      return { filter: (typeof state !== 'undefined' ? state : null)?.hallFilter, hallCount: (typeof state !== 'undefined' ? state : null)?.hallBounds?.length };
    });
    if (allPillTest.filter !== '__all') fail(`EVI01 All-pill click: filter ${allPillTest.filter}, expected __all`);
    else ok('EVI01: clicking All pill restores __all filter');
    if (!allPillTest.hallCount || allPillTest.hallCount < 2) fail(`EVI01 All view: only ${allPillTest.hallCount} hall boxes rendered`);
    else ok(`EVI01 All view: ${allPillTest.hallCount} hall boxes rendered`);
  } catch (err) {
    fail(`unexpected error: ${err.message}`);
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter(r => !r.pass);
  for (const r of results) console.log(`${r.pass ? 'ok  ' : 'FAIL'} ${r.msg}`);
  console.log(`\n${failed.length === 0 ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });
