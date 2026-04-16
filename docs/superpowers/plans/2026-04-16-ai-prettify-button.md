# AI Prettify Button — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Prettify" button that sends the parsed layout to Gemini and re-renders the SVG with cleaner labels, organized groupings, and visual polish — no config, no toggles.

**Architecture:** When clicked, Prettify sends a compact summary of the parse result (halls, blocks, rack counts, grid labels) to the `/api/blueprint` worker endpoint. Gemini returns display hints (clean hall names, suggested color groupings, section labels, notes). The renderer applies these hints as an overlay pass on top of the existing SVG — hall dividers, section badges, a summary card, and cleaned-up labels. The raw data stays untouched.

**Tech Stack:** Vanilla JS, SVG rendering, existing Gemini worker (`ccna-tutor.rpatino-cw.workers.dev/api/blueprint`)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `index.html` | Modify | Add Prettify button in top bar (next to Export) |
| `css/style.css` | Modify | Style for prettify button + summary card |
| `js/app.js` | Modify | Wire button click → AI call → re-render |
| `js/renderer.js` | Modify | Add `renderPrettified()` that overlays polish on existing SVG |

No new files. Four small edits to existing files.

---

## Chunk 1: UI + Wiring

### Task 1: Add Prettify button to the top bar

**Files:**
- Modify: `index.html:77-97` (bar-right section)
- Modify: `css/style.css` (button style)

- [ ] **Step 1: Add the button HTML**

In `index.html`, after the Refresh button and before the Export wrap, add:

```html
<button class="bar-btn prettify-btn" id="btn-prettify" disabled title="AI Prettify">
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M7 1l1.5 3.5L12 6l-3.5 1.5L7 11 5.5 7.5 2 6l3.5-1.5z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
  </svg>
</button>
```

- [ ] **Step 2: Add button styles**

In `css/style.css`, after the existing `.bar-btn` styles:

```css
.prettify-btn:not(:disabled):hover { color: var(--accent, #b45309); }
.prettify-btn.loading { opacity: 0.5; pointer-events: none; }
```

- [ ] **Step 3: Commit**

```bash
git add index.html css/style.css
git commit -m "feat: add Prettify button to top bar (disabled by default)"
```

### Task 2: Wire the button to Gemini

**Files:**
- Modify: `js/app.js` (add prettify handler after export handlers)

- [ ] **Step 4: Build the compact summary from parseResult**

The prompt should include:
- Site name
- Hall names + rack counts per hall
- Type distribution (top 5)
- Grid/pod structure
- Total racks
- Any parser warnings

```javascript
function buildPrettifySummary(pr) {
  const halls = pr.halls.map(h => {
    const racks = h.grids.reduce((sum, g) =>
      sum + g.pods.reduce((s2, p) =>
        s2 + p.sections.reduce((s3, sec) =>
          s3 + sec.blocks.reduce((s4, b) => s4 + b.racksPerRow, 0), 0), 0), 0);
    return `${h.name}: ${racks} racks`;
  }).join('\n');

  return `Site: ${pr.site || 'Unknown'}
Total racks: ${pr.totalRacks}
Halls:\n${halls}
Warnings: ${pr.warnings.length > 0 ? pr.warnings.join('; ') : 'none'}`;
}
```

- [ ] **Step 5: Add the click handler that calls the worker**

```javascript
document.getElementById('btn-prettify').addEventListener('click', async () => {
  const pr = state.parseResult;
  if (!pr) return;

  const btn = document.getElementById('btn-prettify');
  btn.classList.add('loading');
  btn.disabled = true;
  toast('Prettifying...');

  try {
    const summary = buildPrettifySummary(pr);
    const resp = await fetch('https://ccna-tutor.rpatino-cw.workers.dev/api/blueprint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: `Given this datacenter overhead layout summary, return a JSON object with display suggestions to make the floor map cleaner and more organized:

${summary}

Return JSON only:
{
  "title": "clean site title for display",
  "halls": [{"name": "clean hall name", "note": "short status note or empty"}],
  "summary": "1-2 sentence plain English summary of the layout",
  "highlights": ["any notable observations about this site"]
}`
      }),
    });

    if (!resp.ok) throw new Error('AI unavailable');
    const data = await resp.json();
    const text = data.reply || '';
    const jsonStr = text.replace(/^```json?\s*/m, '').replace(/```\s*$/m, '').trim();
    const hints = JSON.parse(jsonStr);

    state.prettifyHints = hints;
    renderPrettified(hints);
    toast('Prettified');
  } catch (err) {
    toast('Prettify failed: ' + err.message, true);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});
```

- [ ] **Step 6: Enable the button after any successful parse**

In `ingest()`, after `renderAll()` is called, add:

```javascript
document.getElementById('btn-prettify').disabled = false;
```

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat: wire Prettify button to Gemini worker"
```

### Task 3: Render the prettified overlay

**Files:**
- Modify: `js/renderer.js` (add `renderPrettified()`)
- Modify: `css/style.css` (summary card style)

- [ ] **Step 8: Add `renderPrettified()` to renderer.js**

This function runs AFTER the normal `renderGrid()`. It adds:
1. A summary card (top-right corner of the SVG)
2. Hall divider lines with cleaned labels
3. Highlight badges for any AI observations

```javascript
function renderPrettified(hints) {
  const svg = document.getElementById('blueprint-svg');
  if (!svg || !hints) return;

  const w = parseFloat(svg.getAttribute('width'));

  // Summary card — top right
  const cardW = 220, cardH = 80, cardX = w - cardW - PAD, cardY = PAD - 10;
  const card = document.createElementNS(NS, 'g');
  card.setAttribute('class', 'prettify-card');

  const bg = mkRect(cardX, cardY, cardW, cardH, '#ffffff', '#e2dfd9');
  bg.setAttribute('rx', '8');
  bg.setAttribute('opacity', '0.95');
  card.appendChild(bg);

  const title = mkText(cardX + 12, cardY + 20, hints.title || state.parseResult?.site || '', P.text, 12, 600, FONT_DISPLAY);
  card.appendChild(title);

  if (hints.summary) {
    const lines = hints.summary.match(/.{1,35}(\s|$)/g) || [hints.summary];
    lines.slice(0, 2).forEach((line, i) => {
      const t = mkText(cardX + 12, cardY + 36 + i * 14, line.trim(), P.text2, 9, 400, FONT);
      card.appendChild(t);
    });
  }

  const rackCount = mkText(cardX + cardW - 12, cardY + 20, `${state.parseResult?.totalRacks || 0} racks`, P.dim, 10, 500, FONT_MONO);
  rackCount.setAttribute('text-anchor', 'end');
  card.appendChild(rackCount);

  svg.appendChild(card);

  // Hall notes — small badges under each hall label
  if (hints.halls && state.hallBounds) {
    hints.halls.forEach((h, i) => {
      if (!h.note) return;
      const bound = state.hallBounds[i];
      if (!bound) return;
      const nt = mkText(bound.x, bound.y + bound.h + 14, h.note, P.dim, 8, 400, FONT);
      svg.appendChild(nt);
    });
  }
}
```

- [ ] **Step 9: Add summary card CSS (for export compatibility)**

```css
.prettify-card rect { filter: drop-shadow(0 2px 8px rgba(0,0,0,0.06)); }
```

- [ ] **Step 10: Commit**

```bash
git add js/renderer.js css/style.css
git commit -m "feat: renderPrettified() — summary card + hall notes overlay"
```

- [ ] **Step 11: Push and test**

```bash
git push
```

Test: Open blueprint-map in CW Chrome, load a site (EVI01), click the sparkle button. Should show a summary card in the top-right and hall notes below each hall label.

---

## What Prettify does NOT do (keeping it simple):

- Does NOT re-layout or reposition racks
- Does NOT change colors or rack type categorization
- Does NOT replace the parse result
- Just adds a clean overlay: summary card, hall notes, AI observations
- One click, no config
