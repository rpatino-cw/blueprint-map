// ════════════════════════════════════════════════════════════════
// LAYOUT PARSER
// 4-pass structural analysis of the raw CSV grid.
// Pure function: grid in → ParseResult out.
// ════════════════════════════════════════════════════════════════

// DH number decoder: DH102 → {floor:1, hall:2}, DH1 → {floor:null, hall:1}
function decodeDH(name) {
  const m = name.match(/DH\s*(\d+)/i);
  if (!m) return { floor: null, hall: null, raw: name };
  const num = m[1];
  if (num.length >= 3) return { floor: +num[0], hall: +num.slice(1), raw: name };
  return { floor: null, hall: +num, raw: name };
}

// Parse SPLAT named range: SPLAT_US_LZL01_DH201_GG1_B_B1_1_SP1 → structured object
function parseSPLAT(value) {
  const m = value.match(/^SPLAT[_-](\w+)[_-](\w+)[_-](DH\d+)[_-](?:(GG\d+)[_-])?([A-Z])[_-]([A-Z]\d+)[_-](\d+)(?:[_-](SP\d+))?/i);
  if (m) return { locode: m[1]+'_'+m[2], dh: m[3], gg: m[4]||null, grid: m[5], pod: m[6], seq: +m[7], sp: m[8]||null, type: 'frontend' };
  const mr = value.match(/^SPLAT[_-](\w+)[_-](\w+)[_-](DH\d+)[_-]ROCE[_-](SP\d+)[_-](\w+)[_-](G\d+)(T\d+)/i);
  if (mr) return { locode: mr[1]+'_'+mr[2], dh: mr[3], sp: mr[4], plane: mr[5], group: mr[6], role: mr[7], type: 'roce' };
  const mo = value.match(/^SPLAT[_-](\w+)[_-](\w+)[_-](DH\d+)[_-]ROCE[_-](SP\d+)[_-](T0)[_-]OVERFLOW[_-](\d+)/i);
  if (mo) return { locode: mo[1]+'_'+mo[2], dh: mo[3], sp: mo[4], role: mo[5], overflow: +mo[6], type: 'overflow' };
  return null;
}

class LayoutParser {
  constructor(grid, hints) {
    this.grid = grid;
    this.hints = hints || null;
    this.rows = grid.length;
    this.cols = Math.max(...grid.map(r => r?.length || 0), 0);
    this.classified = [];
    this.numberRows = [];
    this.blocks = [];
    this.sections = [];
    this.halls = [];
    this.hallHeaders = [];
    this.gridLabels = [];
    this.superpods = [];
    this.stats = {};
    this.site = '';
    this.splatRanges = [];
    this.warnings = [];

    if (this.hints?.custom_type_prefixes) {
      for (const cp of this.hints.custom_type_prefixes) {
        const existing = TypeLibrary.match(cp.prefix);
        if (!existing) {
          const catColors = {
            compute:  { fill: '#0d2b3d', stroke: '#4a9ec4' },
            network:  { fill: '#0d3324', stroke: '#4ac49a' },
            storage:  { fill: '#0d1f33', stroke: '#5a8ac4' },
            spine:    { fill: '#200d33', stroke: '#955ac4' },
            fabric:   { fill: '#1a1a0d', stroke: '#8a8a3a' },
          };
          const colors = catColors[cp.likely_category] || { fill: '#1a2233', stroke: '#5a7a9a' };
          TypeLibrary.addCustom({
            id: `ai-${cp.prefix.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
            label: cp.prefix.replace(/-$/, ''),
            prefixes: [cp.prefix],
            ...colors,
          });
        }
      }
    }

    if (this.hints?.site_name) this.site = this.hints.site_name;
  }

  cell(r, c) {
    return (this.grid[r]?.[c] || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  cellRaw(r, c) {
    return (this.grid[r]?.[c] || '').trim();
  }

  parse() {
    this.pass1_classify();
    this.pass2_detectBlocks();
    this.pass3_groupSections();
    this.pass4_assignHierarchy();
    return this.result();
  }

  // ── PASS 1: CELL CLASSIFICATION ──
  pass1_classify() {
    const hintNumRows = new Set(this.hints?.rack_number_rows?.map(r => r - 1) || []);
    const hintTypeRows = new Set(this.hints?.rack_type_rows?.map(r => r - 1) || []);
    const hintStatRows = new Set(this.hints?.stat_rows?.map(r => r - 1) || []);

    for (let r = 0; r < this.rows; r++) {
      this.classified[r] = [];
      for (let c = 0; c < (this.grid[r]?.length || 0); c++) {
        const v = this.cell(r, c);
        let kind = this._classifyOne(v, r, c);

        if (this.hints) {
          if (hintNumRows.has(r) && kind === 'number') {
            // Keep as 'number'
          }
          if (hintTypeRows.has(r) && kind === 'text' && v) {
            kind = 'rack-type-candidate';
          }
          if (hintStatRows.has(r) && (kind === 'text' || kind === 'number')) {
            kind = 'stat';
          }
        }

        this.classified[r][c] = { value: v, kind };
      }
    }
  }

  _classifyOne(v, r, c) {
    if (!v) return 'empty';

    if (/US-[\w-]+/i.test(v) && (/DH\d/i.test(v) || /DATA\s*HALL/i.test(v) || /APPROVED/i.test(v))) {
      this.hallHeaders.push({ row: r, col: c, value: v });
      const sm = v.match(/(US-[\w]+-[\w]+)/i);
      if (sm && !this.site) this.site = sm[1];
      return 'hall-header';
    }
    if (/^DH\s*\d+$/i.test(v) || /^DATA\s*HALL\s*\d+$/i.test(v) || /DATA\s*HALL\s*\d+/i.test(v)) {
      this.hallHeaders.push({ row: r, col: c, value: v });
      return 'hall-header';
    }

    if (/GRID[-\s]?[A-Z]/i.test(v) || /GRID-POD/i.test(v) || /GRID-GROUP/i.test(v)) {
      this.gridLabels.push({ row: r, col: c, value: v });
      return 'grid-label';
    }

    if (/^SP\s*\d/i.test(v)) {
      this.superpods.push({ row: r, col: c, value: v });
      return 'superpod';
    }

    if (/^ROW$/i.test(v) || /^TYPE$/i.test(v)) return 'col-header';
    if (/^RESERVED$/i.test(v)) return 'reserved';

    if (/^SPLAT[_-]/i.test(v)) {
      const parsed = parseSPLAT(v);
      if (parsed) {
        this.splatRanges.push({ row: r, col: c, value: v, parsed });
        if (parsed.locode && !this.site) this.site = parsed.locode.replace('_', '-');
      }
      return 'splat';
    }

    if (/node count|gpu count|superpods|spine.*count|core count|total switch|leaf count|rack count|cabinet count|total racks|total nodes|total gpus|row count|kW total|power total|capacity/i.test(v)) {
      return 'stat';
    }
    if (/^Totals?$/i.test(v)) return 'stat';
    if (/^[A-Z][\w\s]+:\s*\d/i.test(v) && v.length < 50) return 'stat';

    if (TypeLibrary.isType(v)) return 'rack-type';
    if (/^\d{1,3}$/.test(v) && +v >= 1 && +v <= 999) return 'number';
    if (/kW/i.test(v)) return 'annotation';

    return 'text';
  }

  // ── PASS 2: RACK BLOCK DETECTION ──
  pass2_detectBlocks() {
    const usedRows = new Set();
    const hintNumRows = new Set(this.hints?.rack_number_rows?.map(r => r - 1) || []);
    const minRunLength = this.hints ? 2 : 3;

    for (let r = 0; r < this.rows; r++) {
      const runs = this._findNumberRuns(r);
      for (const run of runs) {
        const threshold = hintNumRows.has(r) ? minRunLength : 3;
        if (run.length < threshold) continue;

        const startCol = run[0].col;
        const endCol = run[run.length - 1].col;
        const nums = run.map(c => c.num);

        const ascending = nums[1] > nums[0];
        const isSequential = nums.every((n, i) => i === 0 || (ascending ? n === nums[i-1] + 1 : n === nums[i-1] - 1));

        let typeRow = null;
        let typeRowIdx = -1;
        for (const offset of [1, -1]) {
          const tr = r + offset;
          if (tr < 0 || tr >= this.rows || usedRows.has(tr)) continue;

          let typeCount = 0;
          let totalChecked = 0;
          for (let ci = 0; ci < run.length; ci++) {
            const col = run[ci].col;
            const tv = this.cell(tr, col);
            if (tv) {
              totalChecked++;
              if (TypeLibrary.isType(tv)) typeCount++;
            }
          }
          if (totalChecked > 0 && typeCount / totalChecked >= 0.4) {
            typeRow = [];
            typeRowIdx = tr;
            for (let ci = 0; ci < run.length; ci++) {
              const col = run[ci].col;
              typeRow.push(this.cell(tr, col));
            }
            break;
          }
        }

        let rowLabel = null;
        for (let cc = endCol + 1; cc <= endCol + 3 && cc < this.cols; cc++) {
          const rv = this.cell(r, cc);
          if (/^\d{1,2}$/.test(rv) && +rv >= 1 && +rv <= 50) {
            rowLabel = +rv;
            if (this.classified[r]?.[cc]) this.classified[r][cc].kind = 'row-label';
            break;
          }
        }
        if (typeRowIdx >= 0 && !rowLabel) {
          for (let cc = endCol + 1; cc <= endCol + 3 && cc < this.cols; cc++) {
            const rv = this.cell(typeRowIdx, cc);
            if (/^\d{1,2}$/.test(rv) && +rv >= 1 && +rv <= 50) {
              rowLabel = +rv;
              if (this.classified[typeRowIdx]?.[cc]) this.classified[typeRowIdx][cc].kind = 'row-label';
              break;
            }
          }
        }

        const block = {
          numberRow: r,
          typeRow: typeRowIdx,
          startCol,
          endCol,
          rackNums: nums,
          rackTypes: typeRow || [],
          racksPerRow: nums.length,
          ascending,
          serpentine: false,
          rowLabel,
        };

        this.blocks.push(block);
        usedRows.add(r);
        if (typeRowIdx >= 0) usedRows.add(typeRowIdx);

        for (const c of run) {
          if (this.classified[r]?.[c.col]) this.classified[r][c.col].kind = 'rack-num';
        }
      }
    }

    this.blocks.sort((a, b) => a.numberRow - b.numberRow || a.startCol - b.startCol);
    for (let i = 0; i < this.blocks.length; i++) {
      const a = this.blocks[i];
      if (a.serpentine) continue;
      for (let j = i + 1; j < this.blocks.length; j++) {
        const b = this.blocks[j];
        if (b.numberRow - a.numberRow > 6) break;
        if (Math.abs(a.startCol - b.startCol) <= 2 &&
            Math.abs(a.endCol - b.endCol) <= 2 &&
            a.ascending !== b.ascending) {
          a.serpentine = true;
          b.serpentine = true;
          a.partner = j;
          b.partner = i;
          break;
        }
      }
    }

    for (let i = 0; i < this.blocks.length; i++) {
      const a = this.blocks[i];
      if (a.partner == null) continue;
      const b = this.blocks[a.partner];
      const first = a.rackNums[0] < b.rackNums[0] ? a : b;
      const second = a.rackNums[0] < b.rackNums[0] ? b : a;
      first.cornerIndices = [0, first.rackNums.length - 1];
      second.cornerIndices = [0, second.rackNums.length - 1];
    }
  }

  _findNumberRuns(r) {
    const runs = [];
    let current = [];

    for (let c = 0; c < (this.grid[r]?.length || 0); c++) {
      const v = this.cell(r, c);
      const cls = this.classified[r]?.[c]?.kind;
      if (cls === 'number') {
        current.push({ col: c, num: +v });
      } else {
        if (current.length >= 3) runs.push(current);
        current = [];
      }
    }
    if (current.length >= 3) runs.push(current);
    return runs;
  }

  // ── PASS 3: SECTION GROUPING ──
  pass3_groupSections() {
    if (this.blocks.length === 0) return;

    const gridLabelRows = new Map();
    for (const gl of this.gridLabels) {
      for (const b of this.blocks) {
        if (gl.col >= b.startCol - 3 && gl.col <= b.endCol + 3) {
          const key = `${b.startCol}-${b.endCol}`;
          if (!gridLabelRows.has(key)) gridLabelRows.set(key, new Set());
          gridLabelRows.get(key).add(gl.row);
          break;
        }
      }
    }

    const used = new Set();
    for (let i = 0; i < this.blocks.length; i++) {
      if (used.has(i)) continue;
      const section = {
        blocks: [this.blocks[i]],
        startCol: this.blocks[i].startCol,
        endCol: this.blocks[i].endCol,
        minRow: this.blocks[i].numberRow,
        maxRow: Math.max(this.blocks[i].numberRow, this.blocks[i].typeRow >= 0 ? this.blocks[i].typeRow : 0),
        gridLabel: null,
        podLabel: null,
      };
      used.add(i);

      const colKey = `${section.startCol}-${section.endCol}`;
      const labelRows = gridLabelRows.get(colKey) || new Set();

      for (let j = i + 1; j < this.blocks.length; j++) {
        if (used.has(j)) continue;
        const b = this.blocks[j];
        if (Math.abs(b.startCol - section.startCol) <= 2 &&
            Math.abs(b.endCol - section.endCol) <= 2 &&
            b.numberRow - section.maxRow <= 6) {

          let labelBetween = false;
          for (const lr of labelRows) {
            if (lr > section.maxRow && lr < b.numberRow) {
              labelBetween = true;
              break;
            }
          }
          if (labelBetween) continue;

          const gap = b.numberRow - section.maxRow;
          if (gap >= 4) {
            let emptyCount = 0;
            for (let rr = section.maxRow + 1; rr < b.numberRow; rr++) {
              const rowCells = this.grid[rr] || [];
              const hasContent = rowCells.some((c, ci) =>
                ci >= section.startCol - 1 && ci <= section.endCol + 1 && c && c.trim() &&
                !/^\s*$/.test(c) && !this.classified[rr]?.[ci]?.kind?.startsWith('grid-label'));
              if (!hasContent) emptyCount++;
            }
            if (emptyCount >= 4) continue;
          }

          section.blocks.push(b);
          section.maxRow = Math.max(section.maxRow, b.numberRow, b.typeRow >= 0 ? b.typeRow : 0);
          used.add(j);
        }
      }

      let bestLabel = null;
      let bestScore = 0;
      for (let rr = section.minRow - 1; rr >= Math.max(0, section.minRow - 8); rr--) {
        for (let cc = section.startCol - 3; cc <= section.endCol + 3; cc++) {
          const cls = this.classified[rr]?.[cc];
          if (cls && cls.kind === 'grid-label') {
            const val = cls.value.replace(/\n/g,' ').replace(/\s+/g,' ');
            let score = 1;
            if (/GRID.?GROUP/i.test(val)) score = 2;
            if (/POD/i.test(val)) score = 3;
            if (score > bestScore) { bestScore = score; bestLabel = val; }
          }
        }
      }
      if (bestLabel) {
        section.gridLabel = bestLabel;
        const gm = bestLabel.match(/GRID[-\s]?([A-Z])/i);
        if (gm) section.gridLetter = gm[1].toUpperCase();
        const pm = bestLabel.match(/POD\s*(\d+|[A-Z]\d+)/i);
        if (pm) section.podLabel = pm[1].toUpperCase();
      }

      this.sections.push(section);
    }

    for (const sec of this.sections) {
      if (sec.gridLabel) {
        sec.gridLabelRaw = sec.gridLabel;
        sec.gridLabel = sec.gridLabel
          .replace(/\s*\(Continues?\)/gi, '')
          .replace(/\s*\(Continued\)/gi, '')
          .replace(/\s*=+>/g, '')
          .replace(/\s*<+=+/g, '')
          .trim();
        const gm = sec.gridLabel.match(/GRID[-\s]?([A-Z])/i);
        if (gm) sec.gridLetter = gm[1].toUpperCase();
        const pm = sec.gridLabel.match(/POD\s*(\d+|[A-Z]\d+)/i);
        if (pm) sec.podLabel = pm[1].toUpperCase();
      }
    }
  }

  // ── PASS 4: HIERARCHY ASSIGNMENT ──
  pass4_assignHierarchy() {
    const statPatterns = /node count|gpu count|superpods|spine.*count|core count|total switch|leaf count|spine.*racks|HD-B2|rack count|cabinet count|total racks|total nodes|total gpus|row count|kW|power|capacity/i;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < (this.grid[r]?.length || 0); c++) {
        const v = this.cell(r, c);
        const cls = this.classified[r]?.[c]?.kind;
        if (cls === 'stat' || statPatterns.test(v)) {
          for (let cc = c + 1; cc <= c + 5 && cc < this.cols; cc++) {
            const nv = this.cell(r, cc);
            if (nv && /^\d/.test(nv)) {
              this.stats[v.replace(/:/g,'').trim()] = nv.trim();
              break;
            }
          }
          const inlineMatch = v.match(/^(.+?):\s*(\d[\d,]*)/);
          if (inlineMatch) {
            this.stats[inlineMatch[1].trim()] = inlineMatch[2].trim();
          }
        }
      }
    }

    const hallMap = new Map();
    for (const hh of this.hallHeaders) {
      const dhm = hh.value.match(/DH(\d+)|DATA\s*HALL\s*(\d+)/i);
      const hallName = dhm ? 'DH' + (dhm[1] || dhm[2]) : hh.value.substring(0, 10);

      let span = 1;
      for (let cc = hh.col + 1; cc < this.cols; cc++) {
        if (!this.cell(hh.row, cc)) span++; else break;
      }

      if (!hallMap.has(hallName)) {
        hallMap.set(hallName, { name: hallName, header: hh, colMin: hh.col, colMax: hh.col + span, sections: [] });
      } else {
        const h = hallMap.get(hallName);
        h.colMin = Math.min(h.colMin, hh.col);
        h.colMax = Math.max(h.colMax, hh.col + span);
      }
    }

    for (const section of this.sections) {
      const secMid = (section.startCol + section.endCol) / 2;
      let bestHall = null;
      let bestDist = Infinity;

      for (const [, hall] of hallMap) {
        if (secMid >= hall.colMin - 3 && secMid <= hall.colMax + 3) {
          const dist = Math.abs(secMid - (hall.colMin + hall.colMax) / 2);
          if (dist < bestDist) { bestDist = dist; bestHall = hall; }
        }
      }
      if (bestHall) {
        bestHall.sections.push(section);
        section.hall = bestHall.name;
      } else {
        section.hall = null;
      }
    }

    if (this.splatRanges.length > 0) {
      const splatHalls = new Map();
      for (const sr of this.splatRanges) {
        const p = sr.parsed;
        if (p.dh && !splatHalls.has(p.dh)) {
          splatHalls.set(p.dh, { name: p.dh, grids: new Set(), pods: new Set(), sps: new Set() });
        }
        if (p.dh) {
          const sh = splatHalls.get(p.dh);
          if (p.grid) sh.grids.add(p.grid);
          if (p.pod) sh.pods.add(p.pod);
          if (p.sp) sh.sps.add(p.sp);
        }
      }
      for (const [dhName, splatInfo] of splatHalls) {
        if (!hallMap.has(dhName)) {
          this.warnings.push(`SPLAT detected hall ${dhName} not found in headers — adding`);
        }
      }
    }

    for (const [, hall] of hallMap) {
      const dh = decodeDH(hall.name);
      const grids = new Map();
      for (const sec of hall.sections) {
        const letter = sec.gridLetter || '?';
        if (!grids.has(letter)) grids.set(letter, { letter, pods: new Map() });
        const g = grids.get(letter);
        const pod = sec.podLabel || '?';
        if (!g.pods.has(pod)) g.pods.set(pod, { name: pod, sections: [] });
        g.pods.get(pod).sections.push(sec);
      }
      this.halls.push({
        name: hall.name,
        floor: dh.floor,
        hallNum: dh.hall,
        colMin: hall.colMin,
        colMax: hall.colMax,
        grids: [...grids.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([, g]) => ({
          letter: g.letter,
          pods: [...g.pods.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([, p]) => ({
            name: p.name,
            sections: p.sections,
          })),
        })),
      });
    }

    if (this.halls.length === 0 && this.hints?.halls?.length > 0) {
      for (const hintHall of this.hints.halls) {
        const [colMin, colMax] = hintHall.col_range || [0, this.cols];
        hallMap.set(hintHall.name, {
          name: hintHall.name,
          header: { row: (hintHall.header_row || 1) - 1, col: colMin },
          colMin,
          colMax,
          sections: [],
        });
      }
      for (const section of this.sections) {
        const secMid = (section.startCol + section.endCol) / 2;
        let bestHall = null, bestDist = Infinity;
        for (const [, hall] of hallMap) {
          if (secMid >= hall.colMin - 3 && secMid <= hall.colMax + 3) {
            const dist = Math.abs(secMid - (hall.colMin + hall.colMax) / 2);
            if (dist < bestDist) { bestDist = dist; bestHall = hall; }
          }
        }
        if (bestHall) { bestHall.sections.push(section); section.hall = bestHall.name; }
      }
      for (const [, hall] of hallMap) {
        const grids = new Map();
        for (const sec of hall.sections) {
          const letter = sec.gridLetter || '?';
          if (!grids.has(letter)) grids.set(letter, { letter, pods: new Map() });
          const g = grids.get(letter);
          const pod = sec.podLabel || '?';
          if (!g.pods.has(pod)) g.pods.set(pod, { name: pod, sections: [] });
          g.pods.get(pod).sections.push(sec);
        }
        this.halls.push({
          name: hall.name, colMin: hall.colMin, colMax: hall.colMax,
          grids: [...grids.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([, g]) => ({
            letter: g.letter,
            pods: [...g.pods.entries()].sort((a,b) => a[0].localeCompare(b[0])).map(([, p]) => ({ name: p.name, sections: p.sections })),
          })),
        });
      }
      if (this.halls.length > 0) this.warnings.push('Hall boundaries detected via AI analysis');
    }

    if (this.halls.length === 0 && this.sections.length > 0) {
      this.halls.push({
        name: 'Layout',
        colMin: 0,
        colMax: this.cols,
        grids: [{ letter: '?', pods: [{ name: '?', sections: this.sections }] }],
      });
      this.warnings.push('No data hall headers detected — all sections grouped as one layout');
    }
  }

  result() {
    let totalRacks = 0;
    for (const b of this.blocks) totalRacks += b.rackNums.length;

    const spSeen = new Map();
    for (const sp of this.superpods) {
      const num = sp.value.match(/\d+/)?.[0];
      if (!num) continue;
      const key = `SP${num}`;
      if (!spSeen.has(key)) spSeen.set(key, { ...sp, value: key });
    }
    const dedupedSuperpods = [...spSeen.values()];

    let gridVersion = null;
    const hasGG2 = this.gridLabels.some(gl => /GG2/i.test(gl.value)) ||
                   this.splatRanges.some(sr => /GG2/i.test(sr.value));
    const hasGB200 = this.blocks.some(b => b.rackTypes.some(t => /GB200|GB300|NVL/i.test(t)));
    if (hasGB200 && !hasGG2) gridVersion = 'v2.0';
    else if (hasGG2) gridVersion = 'v0.5-v1.5';

    return {
      site: this.site,
      halls: this.halls,
      blocks: this.blocks,
      sections: this.sections,
      superpods: dedupedSuperpods,
      gridLabels: this.gridLabels,
      hallHeaders: this.hallHeaders,
      splatRanges: this.splatRanges,
      stats: this.stats,
      gridVersion,
      warnings: this.warnings,
      classified: this.classified,
      grid: this.grid,
      totalRacks,
      cols: this.cols,
      rows: this.rows,
    };
  }
}
