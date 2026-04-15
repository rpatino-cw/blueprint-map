// ════════════════════════════════════════════════════════════════
// APP — State, event listeners, UI wiring
// ════════════════════════════════════════════════════════════════

const state = {
  grid: [],
  parseResult: null,
  viewMode: 'grid',
  zoom: 1, panX: 0, panY: 0,
  dragging: false, dragStart: {x:0,y:0}, panStart: {x:0,y:0},
  highlightSet: new Set(),
  selectedRC: null,
  hallBounds: [],  // [{name, x, y, w, h}] computed during render
};

// ── CSV PARSING ──
// Fallback parser for offline / CDN failure
function parseCSVFallback(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuote = false;
  const len = text.length;

  for (let i = 0; i < len; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuote) {
      if (ch === '"' && next === '"') {
        cell += '"'; i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',' || (ch === '\t')) {
        row.push(cell); cell = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
        i++;
      } else if (ch === '\n') {
        row.push(cell); cell = '';
        rows.push(row); row = [];
      } else {
        cell += ch;
      }
    }
  }
  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  while (rows.length > 0 && rows[rows.length - 1].every(c => !c.trim())) rows.pop();

  return rows;
}

const LARGE_FILE_THRESHOLD = 500 * 1024; // 500KB — use Web Worker above this
const PAPA_OPTS = { delimiter: '', newline: '', quoteChar: '"', skipEmptyLines: 'greedy' };

function parseCSV(text) {
  if (typeof Papa === 'undefined') return parseCSVFallback(text);
  return Papa.parse(text, PAPA_OPTS).data;
}

function parseCSVAsync(text) {
  return new Promise((resolve, reject) => {
    if (typeof Papa === 'undefined') {
      resolve(parseCSVFallback(text));
      return;
    }
    Papa.parse(text, {
      ...PAPA_OPTS,
      worker: true,
      complete: function(results) {
        if (results.errors.length > 0) {
          console.warn('[Blueprint Map] PapaParse warnings:', results.errors);
        }
        resolve(results.data);
      },
      error: function(err) {
        console.error('[Blueprint Map] Worker parse failed, using fallback:', err);
        resolve(parseCSVFallback(text));
      },
    });
  });
}

// ── CELL SELECTION ──
function selectCell(row, col) {
  state.selectedRC = {row,col};
  const pr = state.parseResult;
  const v = (pr.grid[row]?.[col]||'').trim();
  const cls = pr.classified[row]?.[col]?.kind || '?';
  const el = document.getElementById('detail-content');

  let typeAbove = (pr.grid[row-1]?.[col]||'').trim();
  let typeBelow = (pr.grid[row+1]?.[col]||'').trim();
  let rackType=null, rackNum=null;

  if (cls==='rack-num') { rackNum=v; rackType=TypeLibrary.isType(typeAbove)?typeAbove:(TypeLibrary.isType(typeBelow)?typeBelow:null); }
  else if (cls==='rack-type') { rackType=v; if(/^\d{1,3}$/.test(typeAbove))rackNum=typeAbove; else if(/^\d{1,3}$/.test(typeBelow))rackNum=typeBelow; }

  let blockInfo = null;
  for (const b of pr.blocks) {
    if (b.numberRow === row && col >= b.startCol && col <= b.endCol) {
      blockInfo = b; break;
    }
    if (b.typeRow === row && col >= b.startCol && col <= b.endCol) {
      blockInfo = b; break;
    }
  }

  let sectionInfo = null;
  for (const s of pr.sections) {
    if (s.blocks.includes(blockInfo)) { sectionInfo = s; break; }
  }

  el.innerHTML = `
    <div class="detail-title">${cls==='rack-num'?'Rack '+v:v}</div>
    <div class="detail-row"><span class="detail-key">Type</span><span class="detail-val">${cls}</span></div>
    ${rackNum?`<div class="detail-row"><span class="detail-key">Rack #</span><span class="detail-val">${rackNum}</span></div>`:''}
    ${rackType?`<div class="detail-row"><span class="detail-key">Rack Type</span><span class="detail-val">${rackType}</span></div>`:''}
    ${sectionInfo?.hall?`<div class="detail-row"><span class="detail-key">Hall</span><span class="detail-val">${sectionInfo.hall}</span></div>`:''}
    ${sectionInfo?.gridLabel?`<div class="detail-row"><span class="detail-key">Grid</span><span class="detail-val">${sectionInfo.gridLabel}</span></div>`:''}
    ${blockInfo?.serpentine!==undefined?`<div class="detail-row"><span class="detail-key">Serpentine</span><span class="detail-val">${blockInfo.serpentine?'Yes':'No'}</span></div>`:''}
    ${blockInfo?.rowLabel!=null?`<div class="detail-row"><span class="detail-key">Row</span><span class="detail-val">${blockInfo.rowLabel}</span></div>`:''}
    ${blockInfo?`<div class="detail-row"><span class="detail-key">Racks/Row</span><span class="detail-val">${blockInfo.racksPerRow}</span></div>`:''}
    <div class="detail-row"><span class="detail-key">Position</span><span class="detail-val">R${row+1}:C${col+1}</span></div>
  `;

  renderAll();
}

// ── SEARCH ──
function doSearch() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();
  state.highlightSet.clear();
  if (!q) { renderAll(); return; }
  const grid = state.parseResult.grid;
  for (let r=0;r<grid.length;r++) for(let c=0;c<(grid[r]?.length||0);c++) {
    const v=(grid[r][c]||'').trim().toLowerCase();
    if(v&&v.includes(q)) state.highlightSet.add(`${r},${c}`);
  }
  toast(`${state.highlightSet.size} match${state.highlightSet.size!==1?'es':''}`);
  renderAll();
  if(state.highlightSet.size>0) {
    const[fr,fc]=[...state.highlightSet][0].split(',').map(Number);
    const el=document.querySelector(`rect[data-rc="${fr},${fc}"]`);
    if(el){
      const container=document.getElementById('map-container');
      const rx=parseFloat(el.getAttribute('x'))+CELL_W/2;
      const ry=parseFloat(el.getAttribute('y'))+CH/2;
      state.panX=container.clientWidth/2-rx*state.zoom;
      state.panY=container.clientHeight/2-ry*state.zoom;
      applyTransform();
    }
  }
}

// ── PAN & ZOOM ──
function applyTransform() {
  const svg=document.getElementById('blueprint-svg');
  if(!svg)return;
  svg.style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;
  svg.style.transformOrigin='0 0';
  document.getElementById('zoom-level').textContent=Math.round(state.zoom*100)+'%';
}

function fitView() {
  const svg=document.getElementById('blueprint-svg');
  const container=document.getElementById('map-container');
  if(!svg||!container)return;
  const w=parseFloat(svg.getAttribute('width')),h=parseFloat(svg.getAttribute('height'));
  state.zoom=Math.min(container.clientWidth/w,container.clientHeight/h)*.92;
  state.panX=(container.clientWidth-w*state.zoom)/2;
  state.panY=(container.clientHeight-h*state.zoom)/2;
  applyTransform();
}

// ── TOAST ──
function toast(msg,isError){const el=document.getElementById('toast');el.textContent=msg;el.classList.remove('error');if(isError)el.classList.add('error');el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show','error'),isError?8000:3000)}

// ── DOWNLOAD HELPER ──
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href)}

// ── FORMAT DETECTION ──
// Cutsheets / connection tables have distinctive header columns that don't belong in overheads
const CUTSHEET_HEADERS = /\b(A-SIDE|Z-SIDE|A-LOC|Z-LOC|A-PORT|Z-PORT|A-MODEL|Z-MODEL|A-OPTIC|Z-OPTIC|CABLE|PATCH-PANEL|BREAKOUT|DNS-NAME)\b/i;
const MAX_GRID_ROWS = 600;
const MAX_GRID_CELLS = 60000;

function detectFormat(grid) {
  // Check first 3 rows for cutsheet-style headers
  for (let r = 0; r < Math.min(3, grid.length); r++) {
    const row = (grid[r] || []).join(' ');
    const matches = row.match(new RegExp(CUTSHEET_HEADERS, 'gi'));
    if (matches && matches.length >= 3) {
      return { ok: false, reason: 'This looks like a cutsheet (cable/connection table), not an overhead layout. Blueprint Map only renders overhead floor plans.' };
    }
  }
  // Size guard
  const rows = grid.length;
  const maxCols = grid.reduce((mx, r) => Math.max(mx, r?.length || 0), 0);
  const cells = rows * maxCols;
  if (rows > MAX_GRID_ROWS) {
    return { ok: false, reason: `CSV has ${rows.toLocaleString()} rows — overhead layouts are typically under ${MAX_GRID_ROWS}. This file may not be an overhead sheet.` };
  }
  if (cells > MAX_GRID_CELLS) {
    return { ok: false, reason: `Grid is ${rows} x ${maxCols} (${cells.toLocaleString()} cells) — too large to render. Overhead layouts are typically much smaller.` };
  }
  return { ok: true };
}

// ── INGEST ──
async function ingest(csvText) {
  const isLarge = csvText.length > LARGE_FILE_THRESHOLD;
  if (isLarge) {
    toast('Parsing large file...');
    state.grid = await parseCSVAsync(csvText);
  } else {
    state.grid = parseCSV(csvText);
  }

  const check = detectFormat(state.grid);
  if (!check.ok) {
    toast(check.reason, true);
    console.warn(`%c[Blueprint Map] Rejected: ${check.reason}`, 'color:#f85149');
    state.grid = [];
    return;
  }

  const maxCols = state.grid.reduce((mx, r) => Math.max(mx, r?.length || 0), 0);
  console.log(`%c[Blueprint Map] CSV parsed${isLarge?' (worker)':''}: ${state.grid.length} rows, max ${maxCols} cols`, 'color:#7ec8e3');

  let hints = null;
  const statusEl = document.getElementById('ai-status');
  if (AI.isEnabled()) {
    hints = await AI.analyze(state.grid);
  } else {
    statusEl.className = 'ai-status active';
    statusEl.innerHTML = '<strong style="color:#c4a035">AI OFF</strong> — pure rule-based parsing';
    console.log('%c[Blueprint Map] AI disabled — pure rule-based parsing', 'color:#c4a035;font-weight:bold');
  }

  const parser = new LayoutParser(state.grid, hints);
  state.parseResult = parser.parse();
  const pr = state.parseResult;

  console.group('%c[Blueprint Map] AI vs Parser Comparison', 'color:#c4a035;font-weight:bold');

  if (hints) {
    const normHall = n => {
      const m = n.match(/(?:DATA\s*HALL|DH)\s*(\d+)/i);
      return m ? `DH${m[1]}` : n;
    };
    const aiHalls = (hints.halls || []).map(h => h.name);
    const aiHallsNorm = aiHalls.map(normHall);
    const parserHalls = pr.halls.map(h => h.name);
    const parserHallsNorm = parserHalls.map(normHall);
    console.log('HALLS — AI:', aiHalls.join(', '), '| Parser:', parserHalls.join(', '));
    const missingHalls = aiHalls.filter((h, i) => !parserHallsNorm.includes(aiHallsNorm[i]));
    const extraHalls = parserHalls.filter((h, i) => !aiHallsNorm.includes(parserHallsNorm[i]));
    if (missingHalls.length) console.warn('  Parser MISSING halls:', missingHalls);
    if (extraHalls.length) console.warn('  Parser EXTRA halls:', extraHalls);
    if (!missingHalls.length && !extraHalls.length) console.log('  Hall match');

    const aiNumRows = new Set(hints.rack_number_rows || []);
    const parserNumRows = new Set(pr.blocks.map(b => b.numberRow + 1));
    const aiOnly = [...aiNumRows].filter(r => !parserNumRows.has(r));
    const parserOnly = [...parserNumRows].filter(r => !aiNumRows.has(r));
    console.log(`RACK ROWS — AI: ${aiNumRows.size} rows | Parser: ${parserNumRows.size} rows`);
    if (aiOnly.length) console.warn('  AI found but parser MISSED (1-indexed):', aiOnly.sort((a,b)=>a-b));
    if (parserOnly.length) console.log('  Parser found beyond AI sample:', parserOnly.sort((a,b)=>a-b));

    const aiTypeRows = new Set(hints.rack_type_rows || []);
    const parserTypeRows = new Set(pr.blocks.filter(b => b.typeRow >= 0).map(b => b.typeRow + 1));
    const aiTypeOnly = [...aiTypeRows].filter(r => !parserTypeRows.has(r));
    const parserTypeOnly = [...parserTypeRows].filter(r => !aiTypeRows.has(r));
    console.log(`TYPE ROWS — AI: ${aiTypeRows.size} rows | Parser: ${parserTypeRows.size} rows`);
    if (aiTypeOnly.length) console.warn('  AI found but parser MISSED (1-indexed):', aiTypeOnly.sort((a,b)=>a-b));
    if (parserTypeOnly.length) console.log('  Parser found beyond AI sample:', parserTypeOnly.sort((a,b)=>a-b));

    const aiGrids = (hints.grid_labels || []).map(g => g.text);
    const parserGridsAll = pr.gridLabels.map(g => g.value.replace(/\n/g,' ').replace(/\s+/g,' ').trim());
    const parserGrids = [...new Set(parserGridsAll)];
    console.log(`GRID LABELS — AI: ${aiGrids.length} | Parser: ${parserGrids.length} unique (${parserGridsAll.length} total)`);
    if (aiGrids.length !== parserGrids.length) {
      console.warn('  AI grids:', aiGrids);
      console.warn('  Parser grids:', parserGrids);
    }

    console.log(`BLOCKS — Total: ${pr.blocks.length} | Sections: ${pr.sections.length} | Racks: ${pr.totalRacks}`);
    console.log(`SERPENTINE blocks: ${pr.blocks.filter(b=>b.serpentine).length}/${pr.blocks.length}`);

    const aiStatCount = (hints.stat_rows || []).length;
    const parserStatCount = Object.keys(pr.stats).length;
    console.log(`STATS — AI flagged ${aiStatCount} stat rows | Parser found ${parserStatCount} stats:`, pr.stats);

    console.log(`SUPERPODS — Parser found: ${pr.superpods.length}`, pr.superpods.map(s => s.value));
  } else {
    console.log('No AI hints — pure rule-based parse');
    console.log(`Blocks: ${pr.blocks.length} | Sections: ${pr.sections.length} | Halls: ${pr.halls.length} | Racks: ${pr.totalRacks}`);
  }

  if (pr.warnings.length) console.warn('WARNINGS:', pr.warnings);

  console.groupEnd();

  toast(`Parsed: ${pr.totalRacks} racks, ${pr.halls.length} halls, ${pr.blocks.length} blocks`);
  renderAll();
  populateHallSelect(pr);
}

// ── HALL SELECTOR ──
function populateHallSelect(pr) {
  const sel = document.getElementById('hall-select');
  const sep = document.getElementById('hall-sep');
  sel.innerHTML = '<option value="__all">All halls</option>';

  // Only show if 2+ real halls (skip the fallback "Layout" hall)
  const realHalls = pr.halls.filter(h => h.name !== 'Layout');
  if (realHalls.length < 2) {
    sel.style.display = 'none';
    sep.style.display = 'none';
    return;
  }

  for (const h of realHalls) {
    const opt = document.createElement('option');
    opt.value = h.name;
    opt.textContent = h.name;
    sel.appendChild(opt);
  }
  sel.style.display = '';
  sep.style.display = '';
  sel.value = '__all';
}

function focusHall(name) {
  const container = document.getElementById('map-container');
  if (!container) return;

  if (name === '__all') {
    fitView();
    return;
  }

  const hb = state.hallBounds.find(b => b.name === name);
  if (!hb) return;

  // Zoom to fit the hall with 10% padding
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const zx = cw / (hb.w * 1.1);
  const zy = ch / (hb.h * 1.1);
  state.zoom = Math.min(zx, zy, 4);

  // Center the hall
  const hallCx = hb.x + hb.w / 2;
  const hallCy = hb.y + hb.h / 2;
  state.panX = cw / 2 - hallCx * state.zoom;
  state.panY = ch / 2 - hallCy * state.zoom;
  applyTransform();
}

document.getElementById('hall-select').addEventListener('change', e => focusHall(e.target.value));

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

// Search
document.getElementById('btn-search').addEventListener('click',doSearch);
document.getElementById('search-input').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch()});

// View mode toggle
document.getElementById('btn-grid-view').addEventListener('click',()=>{
  state.viewMode='grid';
  document.getElementById('btn-grid-view').classList.add('active');
  document.getElementById('btn-struct-view').classList.remove('active');
  if(state.parseResult) renderAll();
});
document.getElementById('btn-struct-view').addEventListener('click',()=>{
  state.viewMode='structured';
  document.getElementById('btn-struct-view').classList.add('active');
  document.getElementById('btn-grid-view').classList.remove('active');
  if(state.parseResult) renderAll();
});

// Pan & zoom
const mc=document.getElementById('map-canvas');
mc.addEventListener('mousedown',e=>{
  if(e.target.closest('.zoom-controls,.title-block'))return;
  state.dragging=true;state.dragStart={x:e.clientX,y:e.clientY};state.panStart={x:state.panX,y:state.panY};
});
window.addEventListener('mousemove',e=>{if(!state.dragging)return;state.panX=state.panStart.x+(e.clientX-state.dragStart.x);state.panY=state.panStart.y+(e.clientY-state.dragStart.y);applyTransform()});
window.addEventListener('mouseup',()=>{state.dragging=false});
mc.addEventListener('wheel',e=>{
  e.preventDefault();
  const d=e.deltaY>0?.9:1.1;const r=mc.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;
  const nz=Math.max(.02,Math.min(10,state.zoom*d));const s=nz/state.zoom;
  state.panX=mx-s*(mx-state.panX);state.panY=my-s*(my-state.panY);state.zoom=nz;applyTransform();
},{passive:false});
document.getElementById('zoom-in').addEventListener('click',()=>{state.zoom=Math.min(10,state.zoom*1.3);applyTransform()});
document.getElementById('zoom-out').addEventListener('click',()=>{state.zoom=Math.max(.02,state.zoom*.75);applyTransform()});
document.getElementById('zoom-fit').addEventListener('click',fitView);

// Source tabs
document.querySelectorAll('.source-tab').forEach(tab=>{
  tab.addEventListener('click',()=>{
    document.querySelectorAll('.source-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('source-csv').style.display=tab.dataset.source==='csv'?'':'none';
    document.getElementById('source-sheets').style.display=tab.dataset.source==='sheets'?'':'none';
  });
});

// File input
const dz=document.getElementById('drop-zone');const fi=document.getElementById('file-input');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover')}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,()=>dz.classList.remove('dragover')));
dz.addEventListener('drop',e=>{e.preventDefault();if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0])});
fi.addEventListener('change',e=>{if(e.target.files[0])loadFile(e.target.files[0])});

function loadFile(file) {
  const reader=new FileReader();
  reader.onload=async e=>{
    toast(`Loaded ${file.name}`);
    await ingest(e.target.result);
  };
  reader.readAsText(file);
}

// ── LIVE SHEETS (JSONP) ──
const SHEETS_ENDPOINT = 'https://script.google.com/a/macros/coreweave.com/s/AKfycbw_DYXJFneaL7C-6xP4L2XxvlJN9wm0sIEZZWC_aDEygfj5vFUPk98iDV4oUy8r45Bt/exec';

function arrayToCSV(arr) {
  return arr.map(row => (row || []).map(cell => {
    const s = String(cell == null ? '' : cell);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',')).join('\n');
}

function loadFromSheets(tab, sheetId) {
  toast('Fetching live sheet...');
  const cbName = '_bpSheet' + Date.now();
  window[cbName] = async function(data) {
    delete window[cbName];
    if (data.error) { toast('Sheet error: ' + data.error, true); return; }
    await ingest(arrayToCSV(data));
  };
  const s = document.createElement('script');
  const params = '?tab=' + encodeURIComponent(tab || 'OVERHEAD')
    + (sheetId ? '&id=' + encodeURIComponent(sheetId) : '')
    + '&callback=' + cbName;
  s.src = SHEETS_ENDPOINT + params;
  s.onerror = () => { delete window[cbName]; toast('Failed to reach Apps Script endpoint', true); };
  document.body.appendChild(s);
}

// Google Sheets — JSONP fetch
document.getElementById('btn-fetch-sheet').addEventListener('click', () => {
  const tab = document.getElementById('sheet-url').value.trim() || 'OVERHEAD';
  const sheetId = document.getElementById('sheet-site').value;
  loadFromSheets(tab, sheetId);
});

// Export
document.getElementById('btn-export-svg').addEventListener('click',()=>{
  const svg=document.getElementById('blueprint-svg');if(!svg)return;
  const clone=svg.cloneNode(true);clone.removeAttribute('style');
  dl(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'}),`${state.parseResult?.site||'blueprint'}-overhead.svg`);
  toast('SVG exported');
});
document.getElementById('btn-export-png').addEventListener('click',()=>{
  const svg=document.getElementById('blueprint-svg');if(!svg)return;
  const w=parseFloat(svg.getAttribute('width')),h=parseFloat(svg.getAttribute('height')),scale=2;
  const clone=svg.cloneNode(true);clone.removeAttribute('style');
  const str=new XMLSerializer().serializeToString(clone);
  const cvs=document.createElement('canvas');cvs.width=w*scale;cvs.height=h*scale;const ctx=cvs.getContext('2d');
  const img=new Image();const b=new Blob([str],{type:'image/svg+xml;charset=utf-8'});const u=URL.createObjectURL(b);
  img.onload=()=>{ctx.fillStyle='#0d1117';ctx.fillRect(0,0,cvs.width,cvs.height);ctx.drawImage(img,0,0,cvs.width,cvs.height);URL.revokeObjectURL(u);cvs.toBlob(pb=>{dl(pb,`${state.parseResult?.site||'blueprint'}-overhead.png`);toast('PNG exported (2x)');},'image/png');};
  img.src=u;
});

// Resize
window.addEventListener('resize',()=>{if(document.getElementById('blueprint-svg'))fitView()});

// ═══════════════════════════════════════════════════════════════
// PANEL TOGGLE & CANVAS DROP
// ═══════════════════════════════════════════════════════════════

(function() {
  const panel = document.getElementById('panel');
  const btn = document.getElementById('btn-panel');
  btn.addEventListener('click', () => panel.classList.toggle('open'));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') panel.classList.remove('open');
  });
})();

// Refresh button — re-fetches live data
document.getElementById('btn-refresh').addEventListener('click', () => {
  const sheetId = document.getElementById('sheet-site').value;
  loadFromSheets('OVERHEAD', sheetId);
});

// Allow dropping CSV anywhere on the canvas (not just the panel drop zone)
mc.addEventListener('dragover', e => e.preventDefault());
mc.addEventListener('drop', e => {
  e.preventDefault();
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
