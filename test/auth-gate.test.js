#!/usr/bin/env node
// Auth-gate verification — runs a clean (unauthenticated) Playwright browser
// against the deployed Apps Script endpoint and confirms no data is returned.
//
// Run: node test/auth-gate.test.js
// Requires: npm i -D playwright  (once)
//
// Exit 0 = locked down correctly. Exit 1 = endpoint is still public.

const { chromium } = require('playwright');

const ENDPOINT = 'https://script.google.com/a/macros/coreweave.com/s/AKfycbw_DYXJFneaL7C-6xP4L2XxvlJN9wm0sIEZZWC_aDEygfj5vFUPk98iDV4oUy8r45Bt/exec';
const PROBE_TIMEOUT_MS = 10000;

async function probeAnon() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.setContent(`<!doctype html><html><body></body></html>`);

  const result = await page.evaluate(async ({ url, timeout }) => {
    return new Promise((resolve) => {
      const cb = '_anonProbe' + Date.now();
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      window[cb] = (data) => done({ kind: 'callback', data });
      const s = document.createElement('script');
      s.src = url + '?tab=OVERHEAD&callback=' + cb;
      s.onerror = () => done({ kind: 'script-error' });
      document.body.appendChild(s);
      setTimeout(() => done({ kind: 'timeout' }), timeout);
    });
  }, { url: ENDPOINT, timeout: PROBE_TIMEOUT_MS });

  await browser.close();
  return result;
}

function looksLikeRealData(data) {
  if (!Array.isArray(data)) return false;
  if (data.length < 5) return false;
  const flat = JSON.stringify(data);
  return flat.includes('GRID-') || flat.includes('DATA HALL') || flat.includes('coreweave.com');
}

(async () => {
  console.log('→ Probing endpoint with unauthenticated Playwright context...');
  const r = await probeAnon();

  if (r.kind === 'callback' && looksLikeRealData(r.data)) {
    console.error('✗ FAIL — endpoint returned real data to an anonymous browser.');
    console.error('  First row keys:', JSON.stringify(r.data[0]).slice(0, 120) + '...');
    console.error('  Fix: script.google.com → Deploy → Manage deployments');
    console.error('       → "Who has access: Anyone within coreweave.com"');
    process.exit(1);
  }

  if (r.kind === 'callback' && r.data && r.data.error) {
    console.log(`✓ PASS — endpoint returned auth error: ${r.data.error}`);
    process.exit(0);
  }

  if (r.kind === 'script-error' || r.kind === 'timeout') {
    console.log(`✓ PASS — endpoint rejected anonymous script load (${r.kind}).`);
    process.exit(0);
  }

  console.error('? UNCLEAR — unexpected response. Review manually:');
  console.error(JSON.stringify(r).slice(0, 400));
  process.exit(1);
})();
