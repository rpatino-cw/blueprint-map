// ════════════════════════════════════════════════════════════════
// RENDERER — Cab-focused output driven by the global Theme contract
// Labels suppressed via Theme.labels flags. Colors, glow, and hover
// live in css/cab-theme.css; renderer only emits class names.
// ════════════════════════════════════════════════════════════════

const NS = 'http://www.w3.org/2000/svg';
const THEME = (typeof window !== 'undefined' && window.Theme) || {
  cab: { width: 64, height: 44, radius: 7, gap: 4 },
  hall: { padOuter: 22, padY: 22, minGap: 40, showCornerNumber: true },
  labels: { showSiteTitle: false, showHallName: false, showRowLabels: false, showExternalRackNumbers: false, showTypeLabels: false, rackNumberInside: true },
  glow: { mode: 'hover-only' }, tooltip: { enabled: true, showType: true },
};
const CELL_W = THEME.cab.width, CH = THEME.cab.height, PAD = 40;

const P = {
  bg:'#f5f5f7', surface:'#ffffff', text:'#1d1d1f',
  text2:'#6e6e73', dim:'#aeaeb2', primary:'#1d1d1f',
};
const FONT = 'system-ui,-apple-system,sans-serif';
const FONT_DISPLAY = 'DM Serif Display,Georgia,serif';
const FONT_MONO = 'JetBrains Mono,SF Mono,monospace';
const TYPE_FALLBACK = { id: 'fallback', label: 'Other' };

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

  svg.appendChild(mkRect(0, 0, w, h, P.bg, 'none'));

  if (THEME.labels.showSiteTitle) {
    const site = state.parseResult?.site || 'DATACENTER';
    const tt = mkText(PAD, PAD - 10, site, P.text, 14, 400, FONT_DISPLAY);
    tt.setAttribute('letter-spacing', '1');
    svg.appendChild(tt);
  }

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

  // One tooltip element, reused; zero per-cab listeners.
  if (THEME.tooltip?.enabled) {
    let tip = document.getElementById('cab-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'cab-tooltip';
      tip.className = 'cab-tooltip';
      document.body.appendChild(tip);
    }
    svg.addEventListener('mouseover', e => {
      const el = e.target.closest('.cab');
      if (!el) return;
      const type = el.getAttribute('data-type') || el.getAttribute('data-type-label') || '';
      const num = (el.querySelector('text')?.textContent || '').trim();
      if (!type && !num) { tip.classList.remove('visible'); return; }
      tip.innerHTML = (num ? `<span class="tt-num">#${num}</span>` : '') + (type || '');
      tip.classList.add('visible');
    });
    svg.addEventListener('mousemove', e => {
      if (!tip.classList.contains('visible')) return;
      tip.style.left = e.clientX + 'px';
      tip.style.top = e.clientY + 'px';
    });
    svg.addEventListener('mouseout', e => {
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.cab')) return;
      tip.classList.remove('visible');
    });
  }

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

  state.hallBounds = [];
  const filteredHalls = state.hallFilter === '__all' ? pr.halls : pr.halls.filter(h => h.name === state.hallFilter);

  const PAD_OUTER = 22, PADY = 22, MIN_GAP = 24;

  const tentative = [];
  for (const hall of filteredHalls) {
    let hMinR = Infinity, hMaxR = 0;
    for (const g of hall.grids) for (const p of g.pods) for (const s of p.sections) {
      hMinR = Math.min(hMinR, s.minRow);
      hMaxR = Math.max(hMaxR, s.maxRow);
    }
    if (hMinR > hMaxR) continue;
    tentative.push({
      hall, hMinR, hMaxR,
      left: cx(hall.colMin) - PAD_OUTER,
      right: cx(hall.colMin) - PAD_OUTER + (hall.colMax - hall.colMin + 1) * CELL_W + PAD_OUTER * 2,
      top: cy(hMinR) - PADY,
      bottom: cy(hMinR) - PADY + (hMaxR - hMinR + 1) * CH + PADY * 2,
    });
  }

  const sameRowGroups = [];
  const sorted = [...tentative].sort((a, b) => a.top - b.top || a.left - b.left);
  for (const t of sorted) {
    const g = sameRowGroups.find(grp => !(t.bottom < grp.top || t.top > grp.bottom));
    if (g) { g.items.push(t); g.top = Math.min(g.top, t.top); g.bottom = Math.max(g.bottom, t.bottom); }
    else sameRowGroups.push({ top: t.top, bottom: t.bottom, items: [t] });
  }
  for (const g of sameRowGroups) {
    g.items.sort((a, b) => a.left - b.left);
    for (let i = 1; i < g.items.length; i++) {
      const prev = g.items[i - 1], cur = g.items[i];
      const overlap = prev.right + MIN_GAP - cur.left;
      if (overlap > 0) {
        const shrinkPrev = Math.min(overlap / 2, PAD_OUTER - 4);
        const shrinkCur = overlap - shrinkPrev;
        prev.right -= shrinkPrev;
        cur.left += shrinkCur;
      }
    }
  }

  let hallIndex = 0;
  for (const t of tentative) {
    const { hall } = t;
    const hx = t.left;
    const hy = t.top;
    const hw = t.right - t.left;
    const hh = t.bottom - t.top;
    state.hallBounds.push({ name: hall.name, x: hx, y: hy, w: hw, h: hh });

    // Light divider in place of the old heavy halo + box.
    const divider = mkRect(hx, hy, hw, hh, 'none', 'transparent');
    divider.setAttribute('rx', '12');
    divider.setAttribute('ry', '12');
    divider.setAttribute('class', 'hall-divider');
    svg.appendChild(divider);

    if (THEME.labels.showHallName) {
      const ht = mkText(hx + 8, hy - 8, hall.name, P.text, 16, 700, FONT_DISPLAY);
      ht.setAttribute('letter-spacing', '0.5');
      svg.appendChild(ht);
    }

    if (THEME.hall.showCornerNumber) {
      const num = mkText(hx + 10, hy + 18, String(++hallIndex), '', 11, 500, FONT_MONO);
      num.setAttribute('class', 'hall-number');
      svg.appendChild(num);
    } else {
      hallIndex++;
    }
  }

  // ── Pairing pass: rack-type ↔ adjacent rack-num → single cab
  const typeCounts = {};
  const consumedNum = new Set(); // "r,c" of rack-num cells folded into a cab
  const DIGIT_RE = /^\d{1,3}$/;

  const inBounds = (r, c) => {
    if (hallBounds && (r < hallBounds.rowMin || r > hallBounds.rowMax)) return false;
    if (hallBounds && (c < hallBounds.colMin || c > hallBounds.colMax)) return false;
    return r >= minR && r <= maxR && c >= minC && c <= maxC;
  };

  const pairedNum = (r, c) => {
    const above = (grid[r-1]?.[c] || '').trim();
    const below = (grid[r+1]?.[c] || '').trim();
    if (DIGIT_RE.test(above) && classified[r-1]?.[c]?.kind === 'rack-num') return { num: above, row: r - 1 };
    if (DIGIT_RE.test(below) && classified[r+1]?.[c]?.kind === 'rack-num') return { num: below, row: r + 1 };
    return null;
  };

  const renderCab = ({ r, c, rTop, rBot, rackNum, typeValue, cat }) => {
    const x = cx(c), yTop = cy(rTop);
    const h = (rBot - rTop + 1) * CH - 2;
    const key = `${r},${c}`;
    const isHL = state.highlightSet.has(key);
    const isSel = state.selectedRC?.row === r && state.selectedRC?.col === c;

    const g = document.createElementNS(NS, 'g');
    const classes = ['cab', 'cab--' + cat.id];
    if (isHL) classes.push('highlight');
    if (isSel) classes.push('selected');
    g.setAttribute('class', classes.join(' '));
    g.setAttribute('data-rc', key);
    if (typeValue) g.setAttribute('data-type', typeValue);
    if (cat.label) g.setAttribute('data-type-label', cat.label);

    const rect = mkRect(x + 1, yTop + 1, CELL_W - 2, h, '', '');
    rect.setAttribute('rx', THEME.cab.radius);
    rect.setAttribute('ry', THEME.cab.radius);
    g.appendChild(rect);

    if (rackNum && THEME.labels.rackNumberInside) {
      const t = mkText(x + CELL_W / 2, yTop + h / 2 + 5, rackNum, '', 13, 600, FONT_MONO);
      t.setAttribute('text-anchor', 'middle');
      g.appendChild(t);
    }

    if (THEME.labels.showTypeLabels && typeValue) {
      const label = typeValue.length > 9 ? typeValue.substring(0, 8) + '\u2026' : typeValue;
      const t = mkText(x + CELL_W / 2, yTop + h / 2 + 18, label, '', 8, 500, FONT);
      t.setAttribute('text-anchor', 'middle');
      g.appendChild(t);
    }

    svg.appendChild(g);
    if (cat.label) typeCounts[cat.label] = (typeCounts[cat.label] || 0) + 1;
  };

  // Pass 1 — rack-type cells, paired with adjacent rack-num when available
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!inBounds(r, c)) continue;
      const cls = classified[r]?.[c]?.kind;
      if (cls !== 'rack-type' && cls !== 'rack-type-candidate') continue;
      const v = (grid[r]?.[c] || '').trim();
      if (!v) continue;
      const cat = TypeLibrary.match(v) || TYPE_FALLBACK;
      const pair = pairedNum(r, c);
      const rTop = pair ? Math.min(pair.row, r) : r;
      const rBot = pair ? Math.max(pair.row, r) : r;
      if (pair) consumedNum.add(`${pair.row},${c}`);
      renderCab({ r, c, rTop, rBot, rackNum: pair?.num || '', typeValue: v, cat });
    }
  }

  // Pass 2 — standalone rack-num cells (no paired rack-type)
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!inBounds(r, c)) continue;
      const cls = classified[r]?.[c]?.kind;
      if (cls !== 'rack-num') continue;
      const key = `${r},${c}`;
      if (consumedNum.has(key)) continue;
      const v = (grid[r]?.[c] || '').trim();
      if (!v) continue;
      renderCab({ r, c, rTop: r, rBot: r, rackNum: v, typeValue: '', cat: TYPE_FALLBACK });
    }
  }

  // Pass 3 — row labels (optional)
  if (THEME.labels.showRowLabels) {
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (!inBounds(r, c)) continue;
        const cls = classified[r]?.[c]?.kind;
        if (cls !== 'row-label') continue;
        const v = (grid[r]?.[c] || '').trim();
        if (!v) continue;
        const t = mkText(cx(c) + CELL_W/2, cy(r) + CH/2 + 4, v, P.text, 12, 700, FONT_MONO);
        t.setAttribute('text-anchor', 'middle');
        svg.appendChild(t);
      }
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
