// ════════════════════════════════════════════════════════════════
// RENDERER
// Grid view (1:1 cells with overlays) + Structured view
// ════════════════════════════════════════════════════════════════

const NS = 'http://www.w3.org/2000/svg';
const CW = 62, CH = 20, PAD = 60;

function mkRect(x,y,w,h,fill,stroke) {
  const r = document.createElementNS(NS,'rect');
  r.setAttribute('x',x);r.setAttribute('y',y);r.setAttribute('width',w);r.setAttribute('height',h);
  r.setAttribute('fill',fill);r.setAttribute('stroke',stroke);
  return r;
}

function mkText(x,y,content,fill,size,weight,family) {
  const t = document.createElementNS(NS,'text');
  t.setAttribute('x',x);t.setAttribute('y',y);t.setAttribute('fill',fill);t.setAttribute('font-size',size);
  t.setAttribute('font-weight',weight||400);t.setAttribute('font-family',family||'IBM Plex Mono,monospace');
  t.textContent=content;
  return t;
}

function mkSVG(w, h) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('xmlns', NS);
  svg.id = 'blueprint-svg';

  svg.appendChild(mkRect(0, 0, w, h, '#0a1628', 'none'));

  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = `<pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0L0 0 0 40" fill="none" stroke="#1a3a5c" stroke-width=".4" opacity=".2"/></pattern>`;
  svg.appendChild(defs);
  svg.appendChild(mkRect(0, 0, w, h, 'url(#g)', 'none'));

  const f = mkRect(PAD-14, PAD-14, w-PAD*2+28, h-PAD*2+28, 'none', '#3d7cc9');
  f.setAttribute('stroke-width', '1.2');
  svg.appendChild(f);

  const site = state.parseResult?.site || 'DATACENTER';
  const tt = mkText(PAD, PAD-20, `${site} \u2014 OVERHEAD LAYOUT`, '#e8f1fa', 13, 600, 'Space Grotesk,sans-serif');
  tt.setAttribute('letter-spacing', '2');
  svg.appendChild(tt);

  return svg;
}

function addCompass(svg, w, h) {
  const cx = w - PAD + 10, cy = PAD + 10;
  const cg = document.createElementNS(NS, 'g');
  cg.innerHTML = `<circle cx="${cx}" cy="${cy}" r="12" fill="none" stroke="#1a3a5c" stroke-width=".4"/><text x="${cx}" y="${cy-5}" text-anchor="middle" fill="#7ec8e3" font-size="7" font-family="IBM Plex Mono" font-weight="600">N</text>`;
  svg.appendChild(cg);
}

function insertSVG(svg, canvas) {
  const old = canvas.querySelector('svg');
  if (old) old.remove();
  canvas.appendChild(svg);

  const pr = state.parseResult;
  document.getElementById('title-block').style.display = '';
  document.getElementById('tb-title').textContent = pr.site || 'DATACENTER';
  document.getElementById('tb-racks').textContent = pr.totalRacks.toLocaleString();
  document.getElementById('tb-halls').textContent = pr.halls.map(h => h.name).join(', ') || '--';
  document.getElementById('tb-date').textContent = new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});

  document.getElementById('btn-export-svg').disabled = false;
  document.getElementById('btn-export-png').disabled = false;
}

function updateSidebar(pr, typeCounts) {
  const ptEl = document.getElementById('parse-tree');
  document.getElementById('parse-section').style.display = '';
  let ptHTML = '';
  if (pr.site) ptHTML += `<div style="color:var(--accent);font-weight:600;margin-bottom:4px">${pr.site}</div>`;
  if (pr.gridVersion) ptHTML += `<div style="color:var(--dim);font-size:9px;margin-bottom:6px">Grid ${pr.gridVersion}</div>`;
  if (pr.splatRanges?.length > 0) ptHTML += `<div style="color:var(--dim);font-size:9px;margin-bottom:6px">SPLAT ranges: ${pr.splatRanges.length}</div>`;

  for (const hall of pr.halls) {
    const floorInfo = hall.floor != null ? ` (Floor ${hall.floor})` : '';
    ptHTML += `<div class="hall">${hall.name}${floorInfo}</div>`;
    for (const g of hall.grids) {
      ptHTML += `<div class="grid-letter">Grid ${g.letter}</div>`;
      for (const p of g.pods) {
        ptHTML += `<div class="pod">Pod ${p.name} (${p.sections.reduce((s,sec)=>s+sec.blocks.length,0)} rows)</div>`;
      }
    }
  }
  const statKeys = Object.keys(pr.stats);
  if (statKeys.length > 0) {
    ptHTML += `<div style="margin-top:6px;padding-top:4px;border-top:1px solid var(--border)">`;
    for (const k of statKeys.slice(0, 10)) {
      ptHTML += `<div style="font-size:9px;color:var(--dim)">${k}: <span style="color:var(--text)">${pr.stats[k]}</span></div>`;
    }
    ptHTML += `</div>`;
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
        const cat = TypeLibrary.categories.find(c=>c.label===label) || TypeLibrary._custom.find(c=>c.label===label) || {fill:'#1a2233',stroke:'#3d5a7c'};
        return `<div class="legend-item"><div class="legend-swatch" style="background:${cat.fill};border:1px solid ${cat.stroke}"></div><span>${label}</span><span class="legend-count">${count}</span></div>`;
      }).join('');
  }
}

// ── MAIN RENDER DISPATCH ──
function renderAll() {
  if (!state.parseResult) return;
  if (state.viewMode === 'structured') renderStructured();
  else renderGrid();
}

// ── GRID VIEW (enhanced 1:1) ──
function renderGrid() {
  const pr = state.parseResult;
  const grid = pr.grid;
  const classified = pr.classified;
  const canvas = document.getElementById('map-canvas');
  document.getElementById('empty-state').style.display = 'none';

  let minR = Infinity, maxR = 0, minC = Infinity, maxC = 0;
  let nonEmpty = 0;

  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r]?.length || 0); c++) {
      if ((grid[r][c] || '').trim()) {
        nonEmpty++;
        if (r < minR) minR = r; if (r > maxR) maxR = r;
        if (c < minC) minC = c; if (c > maxC) maxC = c;
      }
    }
  }

  if (nonEmpty === 0) { document.getElementById('empty-state').style.display = ''; return; }

  const cols = maxC - minC + 1;
  const rows = maxR - minR + 1;
  const svgW = cols * CW + PAD * 2;
  const svgH = rows * CH + PAD * 2;

  const svg = mkSVG(svgW, svgH);
  const cx = c => PAD + (c - minC) * CW;
  const cy = r => PAD + (r - minR) * CH;

  for (const sec of pr.sections) {
    const sx = cx(sec.startCol) - 2;
    const sy = cy(sec.minRow) - 2;
    const sw = (sec.endCol - sec.startCol + 1) * CW + 4;
    const sh = (sec.maxRow - sec.minRow + 1) * CH + 4;
    const bg = mkRect(sx, sy, sw, sh, 'rgba(61,124,201,.03)', '#3d7cc9');
    bg.setAttribute('stroke-width', '.3');
    bg.setAttribute('stroke-dasharray', '6 3');
    bg.setAttribute('rx', '2');
    svg.appendChild(bg);

    if (sec.gridLabel) {
      const label = sec.gridLabel.substring(0, 45);
      const t = mkText(sx + sw/2, sy - 3, label, '#3d7cc9', 7, 500);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('opacity', '.6');
      svg.appendChild(t);
    }
  }

  for (const hall of pr.halls) {
    let hMinR = Infinity, hMaxR = 0;
    for (const g of hall.grids) for (const p of g.pods) for (const s of p.sections) {
      hMinR = Math.min(hMinR, s.minRow);
      hMaxR = Math.max(hMaxR, s.maxRow);
    }
    if (hMinR > hMaxR) continue;

    const hx = cx(hall.colMin) - 6;
    const hy = cy(hMinR) - 16;
    const hw = (hall.colMax - hall.colMin + 1) * CW + 12;
    const hh = (hMaxR - hMinR + 1) * CH + 28;
    const hbg = mkRect(hx, hy, hw, hh, 'none', '#7ec8e3');
    hbg.setAttribute('stroke-width', '.5');
    hbg.setAttribute('stroke-dasharray', '8 4');
    hbg.setAttribute('opacity', '.4');
    svg.appendChild(hbg);

    const ht = mkText(hx + 4, hy - 3, hall.name, '#7ec8e3', 9, 600, 'Space Grotesk,sans-serif');
    ht.setAttribute('opacity', '.5');
    svg.appendChild(ht);
  }

  const typeCounts = {};
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      const v = (grid[r]?.[c] || '').trim();
      if (!v) continue;
      const x = cx(c), y = cy(r);
      const cls = classified[r]?.[c]?.kind || 'text';
      const key = `${r},${c}`;
      const isHL = state.highlightSet.has(key);
      const isSel = state.selectedRC?.row === r && state.selectedRC?.col === c;

      if (cls === 'rack-num') {
        const bg = mkRect(x+1,y+1,CW-2,CH-2, isHL?'rgba(126,200,227,.15)':'rgba(14,30,52,.6)', isSel?'#e8f1fa':(isHL?'#7ec8e3':'#3d5a7c'));
        bg.setAttribute('stroke-width', isSel?'2':(isHL?'1.5':'.6'));
        bg.setAttribute('rx','1');
        bg.setAttribute('data-rc',key);
        bg.style.cursor='pointer';
        bg.addEventListener('click',()=>selectCell(r,c));
        svg.appendChild(bg);
        const t = mkText(x+CW/2,y+CH/2+4,v,'#c4dff6',10,500);
        t.setAttribute('text-anchor','middle');
        t.setAttribute('pointer-events','none');
        svg.appendChild(t);
      }
      else if (cls === 'rack-type' || cls === 'rack-type-candidate') {
        const style = TypeLibrary.match(v) || {fill:'#1a2233',stroke:'#3d5a7c',label:'Other'};
        typeCounts[style.label] = (typeCounts[style.label]||0)+1;
        const bg = mkRect(x+1,y+1,CW-2,CH-2,style.fill,isHL?'#7ec8e3':style.stroke);
        bg.setAttribute('stroke-width',isHL?'1.5':'.7');
        bg.setAttribute('rx','1');
        bg.setAttribute('data-rc',key);
        bg.style.cursor='pointer';
        bg.addEventListener('click',()=>selectCell(r,c));
        svg.appendChild(bg);
        let label = v.length > 10 ? v.substring(0,9)+'\u2026' : v;
        const t = mkText(x+CW/2,y+CH/2+3,label,style.stroke,7,400);
        t.setAttribute('text-anchor','middle');
        t.setAttribute('pointer-events','none');
        svg.appendChild(t);
      }
      else if (cls === 'grid-label') {
        let span = 1;
        for (let cc=c+1;cc<=maxC;cc++){if(!(grid[r]?.[cc]||'').trim()){span++}else break}
        span=Math.min(span,12);
        const w=span*CW;
        const bg=mkRect(x,y+CH-1,w,1,'#3d7cc9','none');
        bg.setAttribute('opacity','.15');
        svg.appendChild(bg);
      }
      else if (cls === 'hall-header') {
        const labelClean = v.replace(/\n/g,' ').replace(/\s+/g,' ').substring(0,40);
        let span=1;
        for(let cc=c+1;cc<=maxC;cc++){if(!(grid[r]?.[cc]||'').trim())span++;else break}
        span=Math.min(span,8);
        const w=span*CW;
        const bg=mkRect(x,y,w,CH,'rgba(126,200,227,.08)','#7ec8e3');
        bg.setAttribute('stroke-width','.6');
        svg.appendChild(bg);
        const t=mkText(x+w/2,y+CH/2+3,labelClean,'#e8f1fa',9,600,'Space Grotesk,sans-serif');
        t.setAttribute('text-anchor','middle');
        svg.appendChild(t);
      }
      else if (cls === 'superpod') {
        const t=mkText(x+CW/2,y+CH/2+3,v,'#c4a035',9,600);
        t.setAttribute('text-anchor','middle');
        t.setAttribute('letter-spacing','1');
        svg.appendChild(t);
      }
      else if (cls === 'col-header') {
        const bg=mkRect(x+1,y+1,CW-2,CH-2,'rgba(90,122,154,.1)','#5a7a9a');
        bg.setAttribute('stroke-width','.4');
        svg.appendChild(bg);
        const t=mkText(x+CW/2,y+CH/2+3,v,'#5a7a9a',8,600);
        t.setAttribute('text-anchor','middle');
        svg.appendChild(t);
      }
      else if (cls === 'row-label') {
        const t=mkText(x+CW/2,y+CH/2+3,v,'#5a7a9a',9,500);
        t.setAttribute('text-anchor','middle');
        svg.appendChild(t);
      }
      else if (cls === 'reserved') {
        let span=1;
        for(let cc=c+1;cc<=maxC;cc++){if(!(grid[r]?.[cc]||'').trim())span++;else break}
        span=Math.min(span,5);
        const bg=mkRect(x,y+2,span*CW,CH-4,'#111118','#3a3a4a');
        bg.setAttribute('stroke-width','.3');
        bg.setAttribute('stroke-dasharray','3 2');
        svg.appendChild(bg);
        const t=mkText(x+span*CW/2,y+CH/2+3,'RESERVED','#3a3a4a',7,500);
        t.setAttribute('text-anchor','middle');
        svg.appendChild(t);
      }
      else if (cls === 'stat'||cls === 'annotation') {
        const t=mkText(x+2,y+CH/2+3,v.substring(0,25),'#5a7a9a',7,400);
        svg.appendChild(t);
      }
      else if (cls === 'splat') {
        const bg=mkRect(x,y,CW,CH,'rgba(90,60,150,.08)','rgba(90,60,150,.3)');
        bg.setAttribute('stroke-width','.3');
        svg.appendChild(bg);
        const t=mkText(x+2,y+CH/2+3,v.substring(0,20),'#8a5cc4',6,400);
        svg.appendChild(t);
      }
      else if (cls === 'number') {
        const t=mkText(x+CW/2,y+CH/2+3,v,'#3d5a7c',9,400);
        t.setAttribute('text-anchor','middle');
        svg.appendChild(t);
      }
      else if (cls === 'text') {
        const d = v.replace(/\n/g,' ').replace(/\s+/g,' ').substring(0,20);
        if (d) {
          const t=mkText(x+CW/2,y+CH/2+3,d,'#3d5a7c',7,400);
          t.setAttribute('text-anchor','middle');
          svg.appendChild(t);
        }
      }
    }
  }

  addCompass(svg, svgW, svgH);
  insertSVG(svg, canvas);
  updateSidebar(pr, typeCounts);
  fitView();
}

// ── STRUCTURED VIEW ──
function renderStructured() {
  const pr = state.parseResult;
  if (pr.blocks.length === 0) {
    state.viewMode = 'grid';
    renderGrid();
    toast('No rack blocks detected — showing grid view');
    return;
  }

  const canvas = document.getElementById('map-canvas');
  document.getElementById('empty-state').style.display = 'none';

  const BW = 54;
  const BH = 36;
  const BPAD = 40;
  const SEC_GAP = 20;
  const HALL_GAP = 50;

  let totalW = BPAD;
  let totalH = 0;
  const hallLayouts = [];

  for (const hall of pr.halls) {
    let hallW = 0;
    let hallH = 0;
    const gridLayouts = [];

    for (const grid of hall.grids) {
      for (const pod of grid.pods) {
        for (const sec of pod.sections) {
          const rpr = sec.blocks.length > 0 ? sec.blocks[0].racksPerRow : 10;
          const secW = rpr * BW + 20;
          const secH = sec.blocks.length * BH + SEC_GAP;
          hallW = Math.max(hallW, secW);
          hallH += secH;
          gridLayouts.push({ grid, pod, sec, rpr, w: secW, h: secH });
        }
      }
    }
    hallW += 40;
    hallH += 60;
    hallLayouts.push({ hall, gridLayouts, w: hallW, h: hallH, x: totalW });
    totalW += hallW + HALL_GAP;
    totalH = Math.max(totalH, hallH);
  }

  totalH += BPAD * 2;
  totalW += BPAD;

  const svgW = Math.max(totalW, 400);
  const svgH = Math.max(totalH, 300);
  const svg = mkSVG(svgW, svgH);

  const typeCounts = {};

  for (const hl of hallLayouts) {
    const hx = hl.x;
    const hy = BPAD;

    const hbg = mkRect(hx, hy, hl.w, hl.h, 'rgba(126,200,227,.03)', '#7ec8e3');
    hbg.setAttribute('stroke-width', '.5');
    hbg.setAttribute('rx', '2');
    svg.appendChild(hbg);

    const hallLabel = hl.hall.floor != null
      ? `${hl.hall.name}  Floor ${hl.hall.floor}`
      : hl.hall.name;
    const ht = mkText(hx + 10, hy + 16, hallLabel, '#e8f1fa', 12, 700, 'Space Grotesk,sans-serif');
    ht.setAttribute('letter-spacing', '1');
    svg.appendChild(ht);

    let curY = hy + 30;
    let prevGridLetter = null;

    for (const gl of hl.gridLayouts) {
      if (gl.grid.letter !== prevGridLetter) {
        const gt = mkText(hx + 10, curY + 10, `GRID ${gl.grid.letter}`, '#7ec8e3', 9, 600);
        gt.setAttribute('letter-spacing', '1.5');
        svg.appendChild(gt);
        prevGridLetter = gl.grid.letter;
        curY += 14;
      }

      if (gl.pod.name !== '?') {
        const pt = mkText(hx + 20, curY + 10, `Pod ${gl.pod.name}`, '#5a7a9a', 8, 400);
        svg.appendChild(pt);
        curY += 12;
      }

      const sbg = mkRect(hx + 6, curY, gl.w, gl.h - SEC_GAP + 6, 'rgba(61,124,201,.02)', '#3d7cc9');
      sbg.setAttribute('stroke-width', '.3');
      sbg.setAttribute('stroke-dasharray', '4 2');
      svg.appendChild(sbg);

      for (const block of gl.sec.blocks) {
        const bx = hx + 16;
        curY += 2;

        for (let i = 0; i < block.rackNums.length; i++) {
          const rx = bx + i * BW;
          const num = block.rackNums[i];
          const type = block.rackTypes[i] || '';
          const style = TypeLibrary.match(type) || { fill:'#1a2233', stroke:'#3d5a7c', label:'Other' };
          if (type) typeCounts[style.label] = (typeCounts[style.label]||0)+1;

          const bg = mkRect(rx, curY, BW - 2, BH - 2, style.fill, style.stroke);
          bg.setAttribute('stroke-width', '.6');
          bg.setAttribute('rx', '1');
          bg.setAttribute('data-rc', `${block.numberRow},${block.rackNums[i]}`);
          bg.style.cursor = 'pointer';
          svg.appendChild(bg);

          const isCorner = block.cornerIndices?.includes(i);
          if (isCorner) {
            const badge = mkRect(rx + BW - 8, curY, 6, 6, 'rgba(196,160,53,.5)', '#c4a035');
            badge.setAttribute('rx', '1');
            badge.setAttribute('stroke-width', '.4');
            svg.appendChild(badge);
          }

          const nt = mkText(rx + (BW-2)/2, curY + 12, String(num), '#c4dff6', 9, 500);
          nt.setAttribute('text-anchor', 'middle');
          nt.setAttribute('pointer-events', 'none');
          svg.appendChild(nt);

          if (type) {
            let tl = type.length > 8 ? type.substring(0,7)+'\u2026' : type;
            const tt = mkText(rx + (BW-2)/2, curY + 24, tl, style.stroke, 6, 400);
            tt.setAttribute('text-anchor', 'middle');
            tt.setAttribute('pointer-events', 'none');
            svg.appendChild(tt);
          }
        }

        if (block.rowLabel != null) {
          const rlx = bx + block.rackNums.length * BW + 4;
          const rlt = mkText(rlx, curY + BH/2 + 3, String(block.rowLabel), '#5a7a9a', 9, 500);
          svg.appendChild(rlt);
        }

        if (block.serpentine && !block.ascending) {
          const arrow = mkText(bx - 12, curY + BH/2 + 2, '\u21A9', '#5a7a9a', 10, 400);
          svg.appendChild(arrow);
        }

        curY += BH;
      }

      curY += SEC_GAP;
    }
  }

  for (const sp of pr.superpods) {
    const spx = 10;
    const spy = svgH - 30;
    const t = mkText(spx, spy, sp.value, '#c4a035', 9, 600);
    t.setAttribute('letter-spacing', '1');
    svg.appendChild(t);
  }

  const statEntries = Object.entries(pr.stats);
  if (statEntries.length > 0) {
    let sx = BPAD;
    const sy = svgH - 16;
    for (const [k, v] of statEntries.slice(0, 6)) {
      const label = `${k}: ${v}`;
      const t = mkText(sx, sy, label, '#5a7a9a', 8, 400);
      svg.appendChild(t);
      sx += label.length * 5.5 + 20;
    }
  }

  addCompass(svg, svgW, svgH);
  insertSVG(svg, canvas);
  updateSidebar(pr, typeCounts);
  fitView();
}
