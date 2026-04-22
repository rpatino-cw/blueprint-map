#!/usr/bin/env node
// Playwright smoke test for the Incognito sign-in path.
//
// Reproduces the 2026-04-21 bug symptom: in Chrome Incognito with no prior
// Google session, the main app stays stuck on "CoreWeave sign-in required"
// because window.opener gets severed during Google's auth redirect chain and
// the token postMessage never reaches the main tab.
//
// What this test does today (no Google creds required):
//   1. Launches an isolated Chromium context (equivalent to Incognito isolation).
//   2. Loads the live site and asserts the auth banner renders.
//   3. Exercises the storage-bridge path directly: writes a fake bridge
//      payload to localStorage, then verifies the main tab's storage-event
//      handler accepts it (sessionStorage.bp_auth_token set) without needing
//      a real Google popup. This confirms the Incognito-recovery path wires
//      up correctly even if the end-to-end Google flow can't be automated.
//   4. Hits the deployed ?mode=token endpoint unauthenticated, asserts it
//      returns {error:"AUTH"} as JSONP (sanity-checks the Apps Script deploy).
//
// What this test does NOT do (yet):
//   - Full Google sign-in automation. That needs a dedicated test account
//     and 2FA handling. Out of scope for this first pass.
//
// Install once: npm i -D playwright && npx playwright install chromium
// Run:          npm run test:auth-incognito

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.log('SKIP: playwright not installed. Enable with npm i -D playwright && npx playwright install chromium');
  process.exit(0);
}

const SITE = process.env.BP_SITE || 'https://rpatino-cw.github.io/blueprint-map/';
const ENDPOINT = process.env.BP_ENDPOINT || 'https://script.google.com/a/macros/coreweave.com/s/AKfycbw_DYXJFneaL7C-6xP4L2XxvlJN9wm0sIEZZWC_aDEygfj5vFUPk98iDV4oUy8r45Bt/exec';

function log(step, msg) { console.log('[auth-incognito]', step + ':', msg); }

async function runTest() {
  const browser = await chromium.launch({ headless: process.env.BP_HEADFUL ? false : true });
  const ctx = await browser.newContext(); // fresh isolated context = incognito-equivalent storage
  const page = await ctx.newPage();

  const authLogs = [];
  page.on('console', (m) => {
    const t = m.text();
    if (t.indexOf('[BP-AUTH]') >= 0 || t.indexOf('[BP-SIGNIN]') >= 0 || t.indexOf('[BP-FETCH]') >= 0) authLogs.push(t);
  });

  // STEP 1: load site, expect auth banner
  log('load', SITE);
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // allow JSONP fetch to time out and banner to render
  const bannerVisible = await page.evaluate(() => {
    const el = document.getElementById('auth-banner');
    return !!(el && !el.classList.contains('hidden') && el.offsetParent !== null);
  });
  if (!bannerVisible) throw new Error('FAIL: expected auth banner to be visible in fresh isolated context');
  log('banner', 'visible');

  // STEP 2: inject a fake bridge payload, expect sessionStorage.bp_auth_token
  // and the token-delivered-via log.
  log('bridge-inject', 'writing fake bp_auth_bridge to localStorage');
  await page.evaluate(() => {
    // Simulate what signin.html writes after a successful ?mode=token fetch.
    const payload = JSON.stringify({
      token: '00000000-test-test-test-000000000000',
      email: 'test@coreweave.com',
      ts: Date.now(),
    });
    // Fire a StorageEvent synthetically so the main app's path 2 handler triggers.
    // NB: localStorage.setItem in the same tab does NOT fire storage events on itself.
    // In production the event comes from signin.html (different tab). For the test we
    // must dispatch manually.
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'bp_auth_bridge', newValue: payload, oldValue: null, storageArea: localStorage,
    }));
  });
  await page.waitForTimeout(1000);
  const token = await page.evaluate(() => sessionStorage.getItem('bp_auth_token'));
  if (token !== '00000000-test-test-test-000000000000') {
    throw new Error('FAIL: sessionStorage.bp_auth_token not set from storage-event path. Got: ' + token);
  }
  const sawDeliveryLog = authLogs.some((l) => l.indexOf('token delivered via storage-event') >= 0);
  if (!sawDeliveryLog) throw new Error('FAIL: did not see "[BP-AUTH] token delivered via storage-event" console log. Got logs:\n  ' + authLogs.join('\n  '));
  log('bridge-accept', 'sessionStorage populated, storage-event path verified');

  // STEP 3: sanity-check the ?mode=token endpoint from a fresh unauthenticated context.
  // Should return JSONP wrapped {error:"AUTH"}.
  log('endpoint', 'checking ' + ENDPOINT + '?mode=token (expect AUTH without Google session)');
  const endpointCtx = await browser.newContext();
  const endpointPage = await endpointCtx.newPage();
  const resp = await endpointPage.goto(ENDPOINT + '?mode=token&callback=__test__', { waitUntil: 'load', timeout: 15000 }).catch((e) => { throw new Error('endpoint fetch failed: ' + e.message); });
  if (!resp) throw new Error('FAIL: no response from ?mode=token');
  const body = await endpointPage.content();
  const m = body.match(/__test__\((\{[^)]+\})\)/);
  if (!m) throw new Error('FAIL: ?mode=token did not return JSONP. Body:\n' + body.slice(0, 500));
  const data = JSON.parse(m[1]);
  // Unauthenticated call should yield AUTH. If the test runner happens to be
  // logged into a @coreweave.com Google session in this browser profile (rare
  // in CI, possible locally), we'll see {token, email} instead — also valid.
  if (data.error === 'AUTH') {
    log('endpoint', 'returned {error:"AUTH"} as expected');
  } else if (data.token && data.email && data.email.endsWith('@coreweave.com')) {
    log('endpoint', 'returned a real token (runner is signed in as ' + data.email + ')');
  } else {
    throw new Error('FAIL: unexpected ?mode=token response: ' + JSON.stringify(data));
  }

  await endpointCtx.close();
  await ctx.close();
  await browser.close();
  console.log('\n[auth-incognito] PASS — isolated-context banner renders, storage-bridge accepted, endpoint reachable');
}

runTest().catch((err) => {
  console.error('[auth-incognito] FAIL:', err && err.stack || err);
  process.exit(1);
});
