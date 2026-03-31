#!/usr/bin/env node
// Capture real screenshots of Blueprint Map using Playwright
// Usage: npx playwright test --config=scripts/capture-screenshots.js
// Or:    node scripts/capture-screenshots.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const APP_PATH = path.join(__dirname, '..', 'index.html');
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'simple-dh.csv');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  // Load the app
  await page.goto(`file://${APP_PATH}`);
  await page.waitForTimeout(1000);

  // Screenshot 1: Empty state
  await page.screenshot({
    path: path.join(ASSETS_DIR, 'empty-state.png'),
    clip: { x: 0, y: 0, width: 1400, height: 900 }
  });
  console.log('Captured: empty-state.png');

  // Load CSV via file input
  const csvContent = fs.readFileSync(FIXTURE, 'utf8');

  // Inject CSV directly into the app's CSV handler
  await page.evaluate((csv) => {
    // Simulate the CSV being loaded by calling the app's internal parse
    const lines = csv.split('\n');
    const grid = lines.map(line => {
      const cells = [];
      let cell = '', inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { cells.push(cell); cell = ''; continue; }
        cell += ch;
      }
      cells.push(cell);
      return cells;
    });

    // Set state and render
    if (typeof state !== 'undefined') {
      state.grid = grid;
      state.viewMode = 'grid';
      const parser = new LayoutParser(grid);
      state.parseResult = parser.parse();
      renderAll();
    }
  }, csvContent);

  await page.waitForTimeout(1500);

  // Screenshot 2: Grid view with data
  await page.screenshot({
    path: path.join(ASSETS_DIR, 'grid-view.png'),
    clip: { x: 0, y: 0, width: 1400, height: 900 }
  });
  console.log('Captured: grid-view.png');

  // Switch to structured view
  await page.click('#btn-struct-view');
  await page.waitForTimeout(1000);

  // Screenshot 3: Structured view
  await page.screenshot({
    path: path.join(ASSETS_DIR, 'structured-view.png'),
    clip: { x: 0, y: 0, width: 1400, height: 900 }
  });
  console.log('Captured: structured-view.png');

  // Switch back to grid for the demo sequence
  await page.click('#btn-grid-view');
  await page.waitForTimeout(500);

  // Capture frames for GIF: empty → loading → grid → structured
  const frames = [];

  // Frame 1: Show the drop zone (reload for clean state)
  await page.goto(`file://${APP_PATH}`);
  await page.waitForTimeout(1000);
  frames.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 900 } }));

  // Frame 2-3: Load and show grid
  await page.evaluate((csv) => {
    const lines = csv.split('\n');
    const grid = lines.map(line => {
      const cells = [];
      let cell = '', inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { cells.push(cell); cell = ''; continue; }
        cell += ch;
      }
      cells.push(cell);
      return cells;
    });
    if (typeof state !== 'undefined') {
      state.grid = grid;
      state.viewMode = 'grid';
      const parser = new LayoutParser(grid);
      state.parseResult = parser.parse();
      renderAll();
    }
  }, csvContent);
  await page.waitForTimeout(1000);
  frames.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 900 } }));

  // Frame 3: Structured view
  await page.click('#btn-struct-view');
  await page.waitForTimeout(1000);
  frames.push(await page.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 900 } }));

  // Save frames for GIF assembly
  for (let i = 0; i < frames.length; i++) {
    fs.writeFileSync(path.join(ASSETS_DIR, `frame-${i}.png`), frames[i]);
  }
  console.log(`Saved ${frames.length} frames for GIF`);

  await browser.close();
  console.log('Done! Screenshots in assets/');
  console.log('To create GIF: ffmpeg -framerate 0.5 -i assets/frame-%d.png -vf "scale=700:-1" assets/demo.gif');
})().catch(e => { console.error(e); process.exit(1); });
