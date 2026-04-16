// ════════════════════════════════════════════════════════════════
// TYPE LIBRARY
// Data-driven rack type matching via prefix patterns.
// New hardware (HD-GB4c, T0-E-v11a) matches automatically.
// ════════════════════════════════════════════════════════════════

const TypeLibrary = {
  categories: [
    // ── Compute ──
    { id:'compute',    label:'Compute',         prefixes:['HD-B2','HD-B3','HD-GB','HD-H1','H1 x','H1-','H2 x','H2-','NV-CPU'],   fill:'#dceef8', stroke:'#3a87b8' },
    { id:'gpu-nvl',    label:'NVL72 / GB200',   prefixes:['NVL72','NVL36','B200-v','B200-SC'],          fill:'#c8e0f8', stroke:'#2a6ab8' },
    { id:'gpu-gh',     label:'GH200',           prefixes:['GH2 x','GH200'],                            fill:'#c8d8f8', stroke:'#2a5ab8' },
    { id:'gpu-b4',     label:'B4 / B100',       prefixes:['B4 x'],                                     fill:'#d0e4f8', stroke:'#3070b8' },
    { id:'inference',  label:'Inference (L4/A1)',prefixes:['L4 x','A1 x'],                              fill:'#d8ecf8', stroke:'#3888b8' },
    // ── IB / XDR Fabric ──
    { id:'ib-spine',   label:'IB Spine',        prefixes:['IB x','IB-','IB-LAB'],                      fill:'#f4dce8', stroke:'#b04a78' },
    { id:'xdr',        label:'XDR Spine',       prefixes:['XDR'],                                      fill:'#f4e8d4', stroke:'#b8884a' },
    { id:'sc',         label:'Spine Connector', prefixes:['SC-'],                                      fill:'#e8dcf4', stroke:'#7a4ab8' },
    // ── TOR / Edge / Combo ──
    { id:'tor-combo',  label:'TOR+IB Combo',    prefixes:['T0+IB','T0+XDR','T1+XDR'],                  fill:'#d4f4e4', stroke:'#2a9868' },
    { id:'tor',        label:'TOR / Edge',      prefixes:['T0-EOR','T0-E','T1-E','T2-E','T3-E','EDGE-','EDGE ','T1 x','T2 x','T3 x'], fill:'#dcf4e8', stroke:'#3ab87a' },
    { id:'frontend',   label:'Frontend',        prefixes:['T0-FE','T1-FE','T2-FE','T0-RO','T1-RO'],   fill:'#e8f4dc', stroke:'#78b03a' },
    // ── RoCE / Ring / Fabric ──
    { id:'roce-bfr',   label:'BFR / RoCE Fabric',prefixes:['BFR-','BFR'],                              fill:'#dcecf4', stroke:'#4a98b8' },
    { id:'roce-wsr',   label:'WSR / RoCE Spine', prefixes:['WSR-','WSR'],                              fill:'#dcecf4', stroke:'#4a90b8' },
    { id:'ring',       label:'Ring',            prefixes:['RING'],                                     fill:'#ecdcec', stroke:'#8a4a78' },
    { id:'roce',       label:'RoCE',            prefixes:['RoCE','ROCE','roce'],                       fill:'#dcecf4', stroke:'#4a98b8' },
    { id:'fabric',     label:'Fabric',          prefixes:['Fab','Fabric Core'],                        fill:'#ececdc', stroke:'#8a8a4a' },
    // ── Core / Spine ──
    { id:'core',       label:'Core / Spine',    prefixes:['CP','C-C','C-1','C-A','C-B','C1','C2','C3','C4','C5','C6','C7','C8'], fill:'#e4dcf4', stroke:'#7a4ab8' },
    // ── Power / Distribution ──
    { id:'dpr',        label:'DPR',             prefixes:['DPR','dpu-','DPU'],                          fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'pscr',       label:'PSCR',            prefixes:['PSCR'],                                     fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'psdr',       label:'PSDR',            prefixes:['PSDR','W/PSDR','W/PS-DR','W-PSDR','W/PS'],  fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'fcr',        label:'FCR',             prefixes:['FCR-','FCR'],                               fill:'#f4ead4', stroke:'#b89a4a' },
    // ── Security / Management ──
    { id:'ms-sec',     label:'Security / MS',   prefixes:['MS-SEC','MS-WAN','CW-SEC','SEC-','SEC'],    fill:'#f4dcd8', stroke:'#b84a42' },
    { id:'mgmt',       label:'Management',      prefixes:['mgmt-core','net-agg','net-dist','comp-agg','comp-dist','grid-agg','pod-dist','infra-dist','infra-sw','R-MGMT','BE-MGMT','IT-CORE'], fill:'#dcf0dc', stroke:'#4a984a' },
    // ── Ethernet / Enterprise ──
    { id:'ethernet',   label:'Ethernet / E-NET',prefixes:['E-NET','ENT-DR'],                           fill:'#e0f4e0', stroke:'#509850' },
    // ── Storage ──
    { id:'storage',    label:'Storage',         prefixes:['V x','V-x','V-6','VAST','STRG','DDN'],      fill:'#dce4f4', stroke:'#4a6ab8' },
    // ── Infrastructure ──
    { id:'fdp',        label:'FDP',             prefixes:['FDP'],                                      fill:'#dcf0f0', stroke:'#4a9898' },
    { id:'spine-sw',   label:'Spine Switch',    prefixes:['S1-','S3-','S5-','S7-','S1 ','S5 ','S9 ','S13','S17','S21','S25','S29','S33','S37','S41','S45','S49','S53','S57','S61','S65','S69'], fill:'#dcf0f4', stroke:'#3a98b8' },
    { id:'reserved',   label:'Reserved',        prefixes:['RES'],                                     fill:'#ebebeb', stroke:'#a0a0a0' },
    { id:'unalloc',    label:'Unallocated',     prefixes:['U'],                                       fill:'#e8e8e8', stroke:'#b0b0b0' },
    { id:'firewall',   label:'Firewall',        prefixes:['oob-fw','FW-'],                            fill:'#f4dcd8', stroke:'#b84a42' },
    { id:'console',    label:'Console / OOB',   prefixes:['con-','OG-','opengear'],                   fill:'#dcdcf4', stroke:'#5a5ab8' },
    { id:'pkey',       label:'PKey',            prefixes:['PKey','pkey'],                              fill:'#ececdc', stroke:'#8a8a4a' },
    { id:'t-tier',     label:'T-Tier Spine',    prefixes:['T4-','T3-','T2-','T1-','T0-'],             fill:'#dcecf4', stroke:'#4a88b8' },
    { id:'fbs',        label:'FBS',             prefixes:['FBS','fbs'],                                fill:'#ecdcec', stroke:'#8a4a8a' },
    { id:'dss',        label:'DSS / Shim',      prefixes:['dss','DSS'],                                fill:'#ececdc', stroke:'#8a8a4a' },
    { id:'overflow',   label:'Overflow',        prefixes:['OVERFLOW','overflow','OVF'],                fill:'#f4dcdc', stroke:'#b85a5a' },
    { id:'gpu-rma',    label:'GPU RMA',         prefixes:['GPU-RMA'],                                  fill:'#f8d8d8', stroke:'#b84040' },
    { id:'temp',       label:'Temp / Staging',  prefixes:['TEMP-'],                                    fill:'#f0f0dc', stroke:'#a0a050' },
  ],

  _custom: [],

  match(value) {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    // Fast path: use pre-built sorted index
    if (this._index) return this._fastMatch(v);
    // Fallback: linear scan (only if index not yet built)
    const all = [...this._custom, ...this.categories];
    for (const cat of all) {
      for (const p of cat.prefixes) {
        if (v === p) return cat;
        if (v.startsWith(p)) {
          if (p.length === 1) {
            const next = v[1];
            if (!next || next === ' ' || /\d/.test(next)) return cat;
          } else {
            return cat;
          }
        }
      }
    }
    return null;
  },

  isType(value) {
    return this.match(value) !== null;
  },

  addCustom(cat) {
    this._custom.push(cat);
    try { localStorage.setItem('bp_custom_types', JSON.stringify(this._custom)); } catch(e) {}
    this._buildIndex();
  },

  loadCustom() {
    try {
      const s = localStorage.getItem('bp_custom_types');
      if (s) this._custom = JSON.parse(s);
    } catch(e) {}
    this._buildIndex();
  },

  // ── Sorted prefix index for fast matching ──
  _index: null,
  _singleCharPrefixes: null,

  _buildIndex() {
    const all = [...this._custom, ...this.categories];
    const entries = [];
    const singles = new Map(); // single-char prefix → category
    for (const cat of all) {
      for (const p of cat.prefixes) {
        if (p.length === 1) {
          if (!singles.has(p)) singles.set(p, cat);
        } else {
          entries.push([p, cat]);
        }
      }
    }
    // Sort descending by prefix length, then alphabetically — longest match wins
    entries.sort((a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]));
    this._index = entries;
    this._singleCharPrefixes = singles;
  },

  _fastMatch(v) {
    if (!this._index) return null;
    // Check multi-char prefixes (longest first)
    for (const [p, cat] of this._index) {
      if (v === p || v.startsWith(p)) return cat;
    }
    // Check single-char prefixes with guard
    for (const [p, cat] of this._singleCharPrefixes) {
      if (v === p) return cat;
      if (v.startsWith(p)) {
        const next = v[1];
        if (!next || next === ' ' || /\d/.test(next)) return cat;
      }
    }
    return null;
  },
};
TypeLibrary.loadCustom();
