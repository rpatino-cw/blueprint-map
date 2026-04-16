// ════════════════════════════════════════════════════════════════
// RENDERER — Clean rack-focused output
// Only renders: rack numbers, rack types, hall labels, row labels
// ════════════════════════════════════════════════════════════════

const NS = 'http://www.w3.org/2000/svg';
const CELL_W = 56, CH = 24, PAD = 40;

const P = {
  bg:'#f5f5f7', surface:'#ffffff', text:'#1d1d1f',
  text2:'#6e6e73', dim:'#aeaeb2', primary:'#1d1d1f',
};
const FONT = 'system-ui,-apple-system,sans-serif';
const FONT_DISPLAY = 'DM Serif Display,Georgia,serif';
const FONT_MONO = 'JetBrains Mono,SF Mono,monospace';
const TYPE_FALLBACK = { fill: '#f0f0f2', stroke: '#c0c0c0', label: 'Other' };

function mkRect(x,y,w,h,fill,stroke) {
  const r = document.createElementNS(NS,'rect');
  r.setAttribute('x',x);r.setAttribute('y',y);r.setAttribute('width',w);r.setAttribute('height',h);
  r.setAttribute('fill',fill);r.setAttribute('stroke',stroke);
  return r;
}

function mkText(x,y,content,fill,size,weight,family) {
  const t = document.createElementNS(NS,'text');
  t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('fill',fill);t.setAttribute('font-size',size);
  t.setAttribute('font-weight',weight||400);t.setAttribute('font-family',family||FONT);
  t.textContent=content;
  return t;
}

function mkSVG(w, h) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('xmlns', NS);
  svg.id = 'blueprint-svg';
  svg.style.willChange = 'transform';
  svg.style.contain = 'layout style paint';
  svg.setAttribute('shape-rendering', 'geometricPrecision');
  svg.setAttribute('text-rendering', 'optimizeLegibility');

  // clean background — no grid pattern
  svg.appendChild(mkRect(0, 0, w, h, P.bg, 'none'));

  // site title
  const site = state.parseResult?.site || 'DATACENTER';
  const tt = mkText(PAD, PAD - 10, site, P.text, 14, 400, FONT_DISPLAY);
  tt.setAttribute('letter-spacing', '1');
  svg.appendChild(tt);

  return svg;
}

function insertSVG(svg, canvas) {
  const old = canvas.querySelector('svg');
  if (old) old.remove();
  svg.classList.add('map-enter');
  canvas.appendChild(svg);
  svg.addEventListener('animationend', () => svg.classList.remove('map-enter'), { once: true });

  // Single delegated click handler — replaces 240+ per-cell listeners
  svg.addEventListener('click', e => {
    const el = e.target.closest('[data-rc]');
    if (!el) return;
    const [r, c] = el.getAttribute('data-rc').split(',').map(Number);
    selectCell(r, c);
  });

  const pr = state.parseResult;
  document.getElementById('title-block').style.display = '';
  document.getElementById('tb-title').textContent = pr.site || 'DATACENTER';
  document.getElementById('tb-racks').textContent = pr.totalRacks.toLocaleString();
  document.getElementById('tb-halls').textContent = pr.halls.map(h => h.name).join(', ') || '--';
  document.getElementById('tb-date').textContent = new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  document.getElementById('btn-export').disabled = false;
}

function updateSidebar(pr, typeCounts) {
  const ptEl = document.getElementById('parse-tree');
  document.getElementById('parse-section').style.display = '';
  let ptHTML = '';
  if (pr.site) ptHTML += `<div style="color:var(--text);font-weight:600;margin-bottom:4px">${pr.site}</div>`;

  for (const hall of pr.halls) {
    ptHTML += `<div class="hall">${hall.name}</div>`;
    for (const g of hall.grids) {
      ptHTML += `<div class="grid-letter">Grid ${g.letter}</div>`;
      for (const p of g.pods) {
        ptHTML += `<div class="pod">Pod ${p.name} (${p.sections.reduce((s,sec)=>s+sec.blocks.length,0)} rows)</div>`;
      }
    }
  }
  if (pr.warnings.length > 0) {
    for (const w of pr.warnings) ptHTML += `<div class="parse-warn">${w}</div>`;
  }
  ptEl.innerHTML = ptHTML;

  if (Object.keys(typeCounts).length > 0) {
    document.getElementById('legend-section').style.display = '';
    document.getElementById('legend').innerHTML = Object.entries(typeCounts)
      .sort((a,b)=>b[1]-a[1])
      .map(([label, count]) => {
        const cat = TypeLibrary.categories.find(c=>c.label===label) || TypeLibrary._custom.find(c=>c.label===label) || {fill:'#f0f0f2',stroke:'#c0c0c0'};
        return `<div class="legend-item"><div class="legend-swatch" style="background:${cat.fill};border:1px solid ${cat.stroke}"></div><span>${label}</span><span class="legend-count">${count}</span></div>`;
      }).join('');
  }
}

function getHallBoundsForFilter(pr, filter) {
  if (filter === '__all') return null;
  const hall = pr.halls.find(h => h.name === filter);
  if (!hall) return null;
  let rMin = Infinity, rMax = 0;
  for (const g of hall.grids) for (const p of g.pods) for (const s of p.sections) {
    rMin = Math.min(rMin, s.minRow);
    rMax = Math.max(rMax, s.maxRow);
  }
  return { colMin: hall.colMin - 1, colMax: hall.colMax + 2, rowMin: Math.max(0, rMin - 4), rowMax: rMax + 2 };
}

function renderAll() {
  if (!state.parseResult) return;
  renderGrid();
}

function renderGrid() {
  const pr = state.parseResult;
  const grid = pr.grid;
  const classified = pr.classified;
  const canvas = document.getElementById('map-canvas');
  document.getElementById('empty-state').style.display = 'none';

  const hallBounds = getHallBoundsForFilter(pr, state.hallFilter);

  // Only count rack-num and rack-type cells for bounds
  let minR = Infinity, maxR = 0, minC = Infinity, maxC = 0;
  let nonEmpty = 0;

  for (let r = 0; r < grid.length; r++) {
    if (hallBounds && (r < hallBounds.rowMin || r > hallBounds.rowMax)) continue;
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      if (hallBounds && (c < hallBounds.colMin || c > hallBounds.colMax)) continue;
      const cls = classified[r]?.[c]?.kind;
      if (cls === 'rack-num' || cls === 'rack-type' || cls === 'rack-type-candidate' || cls === 'hall-header' || cls === 'row-label') {
        nonEmpty++;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (c < minC) minC = c; if (c > maxC) maxC = c;
      }
    }
  }

  if (nonEmpty === 0) { document.getElementById('empty-state').style.display = ''; return; }

  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const svgW = cols * CELL_W + PAD * 2;
  const svgH = rows * CH + PAD * 2;

  const svg = mkSVG(svgW, svgH);
  const cx = c => PAD + (c - minC) * CELL_W;
  const cy = r => PAD + (r - minR) * CH;

  // Hall labels — minimal, just the name
  state.hallBounds = [];
  const filteredHalls = state.hallFilter === '__all' ? pr.halls : pr.halls.filter(h => h.name === state.hallFilter);
  for (const hall of filteredHalls) {
    let hMinR = Infinity, hMaxR = 0;
    for (const g of hall.grids) for (const p of g.pods) for (const s of p.sections) {
      hMinR = Math.min(hMinR, s.minRow);
      hMaxR = Math.max(hMaxR, s.maxRow);
    }
    if (hMinR > hMaxR) continue;

    const hx = cx(hall.colMin);
    const hy = cy(hMinR) - 14;
    const hw = (hall.colMax - hall.colMin + 1) * CELL_W;
    const hh = (hMaxR - hMinR + 1) * CH + 20;
    state.hallBounds.push({ name: hall.name, x: hx - 4, y: hy, w: hw + 8, h: hh });

    // just the label, no box
    const ht = mkText(hx, hy - 2, hall.name, P.dim, 11, 600, FONT_DISPLAY);
    svg.appendChild(ht);
  }

  // Render only racks + row labels
  const typeCounts = {};
  const RX = 3; // border radius

  for (let r = minR; r <= maxR; r++) {
    if (hallBounds && (r < hallBounds.rowMin || r > hallBounds.rowMax)) continue;
    for (let c = minC; c <= maxC; c++) {
      if (hallBounds && (c < hallBounds.colMin || c > hallBounds.colMax)) continue;
      const cls = classified[r]?.[c]?.kind;
      if (!cls) continue;

      const v = (grid[r]?.[c] || '').trim();
      if (!v) continue;
      const x = cx(c), y = cy(r);
      const key = `${r},${c}`;
      const isHL = state.highlightSet.has(key);
      const isSel = state.selectedRC?.row === r && state.selectedRC?.col === c;

      if (cls === 'rack-num') {
        const bg = mkRect(x+1, y+1, CELL_W-2, CH-2, '#ffffff', isSel ? P.text : (isHL ? P.text : '#d2d2d7'));
        bg.setAttribute('stroke-width', isSel ? '1.5' : '.5');
        bg.setAttribute('rx', RX);
        bg.setAttribute('data-rc', key);
        svg.appendChild(bg);
        const t = mkText(x + CELL_W/2, y + CH/2 + 4, v, P.text, 10, 500, FONT_MONO);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('pointer-events', 'none');
        svg.appendChild(t);
      }
      else if (cls === 'rack-type' || cls === 'rack-type-candidate') {
        const style = TypeLibrary.match(v) || TYPE_FALLBACK;
        typeCounts[style.label] = (typeCounts[style.label]||0) + 1;
        const bg = mkRect(x+1, y+1, CELL_W-2, CH-2, style.fill, isHL ? P.text : style.stroke);
        bg.setAttribute('stroke-width', isHL ? '1' : '.5');
        bg.setAttribute('rx', RX);
        bg.setAttribute('data-rc', key);
        svg.appendChild(bg);
        let label = v.length > 9 ? v.substring(0,8)+'\u2026' : v;
        const t = mkText(x + CELL_W/2, y + CH/2 + 3, label, style.stroke, 7.5, 500, FONT);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('pointer-events', 'none');
        svg.appendChild(t);
      }
      else if (cls === 'row-label') {
        const t = mkText(x + CELL_W/2, y + CH/2 + 4, v, P.dim, 9, 500, FONT_MONO);
        t.setAttribute('text-anchor', 'middle');
        svg.appendChild(t);
      }
      else if (cls === 'hall-header') {
        // skip — handled above as hall labels
      }
      // everything else: skip (no grid labels, stats, annotations, text, numbers, etc.)
    }
  }

  insertSVG(svg, canvas);
  updateSidebar(pr, typeCounts);
  fitView();
}

// Keep structured view function stub for backward compat
function renderStructured() { renderGrid(); }

// ── AI PRETTIFY OVERLAY ──
function renderPrettified(hints) {
  const svg = document.getElementById('blueprint-svg');
  if (!svg || !hints) return;

  // Remove previous prettify elements
  svg.querySelectorAll('.prettify-el').forEach(el => el.remove());

  const w = parseFloat(svg.getAttribute('width'));

  // Summary card — top right
  const cardW = 220, cardH = 80, cardX = w - cardW - PAD, cardY = PAD - 10;
  const card = document.createElementNS(NS, 'g');
  card.setAttribute('class', 'prettify-el');

  const bg = mkRect(cardX, cardY, cardW, cardH, '#ffffff', '#e2dfd9');
  bg.setAttribute('rx', '8');
  bg.setAttribute('opacity', '0.95');
  card.appendChild(bg);

  const title = mkText(cardX + 12, cardY + 20, hints.title || state.parseResult?.site || '', P.text, 12, 600, FONT_DISPLAY);
  card.appendChild(title);

  if (hints.summary) {
    const lines = hints.summary.match(/.{1,35}(\s|$)/g) || [hints.summary];
    lines.slice(0, 2).forEach((line, i) => {
      card.appendChild(mkText(cardX + 12, cardY + 36 + i * 14, line.trim(), P.text2, 9, 400, FONT));
    });
  }

  const rackCount = mkText(cardX + cardW - 12, cardY + 20, `${state.parseResult?.totalRacks || 0} racks`, P.dim, 10, 500, FONT_MONO);
  rackCount.setAttribute('text-anchor', 'end');
  card.appendChild(rackCount);

  svg.appendChild(card);

  // Hall notes
  if (hints.halls && state.hallBounds) {
    hints.halls.forEach((h, i) => {
      if (!h.note) return;
      const bound = state.hallBounds[i];
      if (!bound) return;
      const nt = mkText(bound.x, bound.y + bound.h + 14, h.note, P.dim, 8, 400, FONT);
      nt.setAttribute('class', 'prettify-el');
      svg.appendChild(nt);
    });
  }

  // Highlights — small list below the card
  if (hints.highlights?.length) {
    hints.highlights.slice(0, 3).forEach((h, i) => {
      const ht = mkText(cardX + 12, cardY + cardH + 16 + i * 14, '- ' + h, P.text2, 8, 400, FONT);
      ht.setAttribute('class', 'prettify-el');
      svg.appendChild(ht);
    });
  }
}
