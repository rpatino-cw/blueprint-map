// ════════════════════════════════════════════════════════════════
// TYPE LIBRARY
// Data-driven rack type matching via prefix patterns.
// New hardware (HD-GB4c, T0-E-v11a) matches automatically.
// ════════════════════════════════════════════════════════════════

const TypeLibrary = {
  categories: [
    { id:'compute',  label:'Compute',        prefixes:['HD-B2','HD-GB','H1 x','H1-','H2 x','H2-'],   fill:'#dceef8', stroke:'#3a87b8' },
    { id:'ib-spine', label:'IB Spine',        prefixes:['IB x','IB-'],                                fill:'#f4dce8', stroke:'#b04a78' },
    { id:'xdr',      label:'XDR Spine',       prefixes:['XDR'],                                       fill:'#f4e8d4', stroke:'#b8884a' },
    { id:'sc',       label:'Spine Connector', prefixes:['SC-'],                                       fill:'#e8dcf4', stroke:'#7a4ab8' },
    { id:'tor',      label:'TOR / Edge',      prefixes:['T0-EOR','T0+IB','T0-E','T1-E','T2-E','T3-E','EDGE-','EDGE '], fill:'#dcf4e8', stroke:'#3ab87a' },
    { id:'frontend', label:'Frontend',        prefixes:['T0-FE','T1-FE','T2-FE','T0-RO','T1-RO'],     fill:'#e8f4dc', stroke:'#78b03a' },
    { id:'dpr',      label:'DPR',             prefixes:['DPR','dpu-','DPU'],                            fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'pscr',     label:'PSCR',            prefixes:['PSCR'],                                       fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'psdr',     label:'PSDR',            prefixes:['PSDR'],                                       fill:'#f4f0d4', stroke:'#b0a83a' },
    { id:'fcr',      label:'FCR',             prefixes:['FCR-','FCR'],                                fill:'#f4ead4', stroke:'#b89a4a' },
    { id:'ms-sec',   label:'MS-SEC',          prefixes:['MS-SEC','MS-'],                              fill:'#f4dcd8', stroke:'#b84a42' },
    { id:'core',     label:'Core / Spine',    prefixes:['CP','C-C','C-1','C1','C2','C3','C4','C5','C6','C7','C8'], fill:'#e4dcf4', stroke:'#7a4ab8' },
    { id:'storage',  label:'Storage',         prefixes:['V x','V-x','VAST'],                           fill:'#dce4f4', stroke:'#4a6ab8' },
    { id:'fabric',   label:'Fabric',          prefixes:['Fab'],                                       fill:'#ececdc', stroke:'#8a8a4a' },
    { id:'spine-sw', label:'Spine Switch',    prefixes:['S1-','S3-','S5-','S7-','S1 ','S5 ','S9 ','S13','S17','S21','S25','S29','S33','S37','S41','S45','S49','S53','S57','S61','S65','S69'], fill:'#dcf0f4', stroke:'#3a98b8' },
    { id:'reserved', label:'Reserved',        prefixes:['RES'],                                       fill:'#ebebeb', stroke:'#a0a0a0' },
    { id:'unalloc',  label:'Unallocated',     prefixes:['U'],                                         fill:'#e8e8e8', stroke:'#b0b0b0' },
    { id:'mgmt',     label:'Management',      prefixes:['mgmt-core','net-agg','net-dist','comp-agg','comp-dist','grid-agg','pod-dist','infra-dist','infra-sw'], fill:'#dcf0dc', stroke:'#4a984a' },
    { id:'firewall', label:'Firewall',        prefixes:['oob-fw','FW-'],                              fill:'#f4dcd8', stroke:'#b84a42' },
    { id:'console',  label:'Console / OOB',   prefixes:['con-','OG-','opengear'],                     fill:'#dcdcf4', stroke:'#5a5ab8' },
    { id:'pkey',     label:'PKey',            prefixes:['PKey','pkey'],                                fill:'#ececdc', stroke:'#8a8a4a' },
    { id:'t-tier',   label:'T-Tier Spine',    prefixes:['T4-','T3-','T2-','T1-','T0-'],               fill:'#dcecf4', stroke:'#4a88b8' },
    { id:'fbs',      label:'FBS',             prefixes:['FBS','fbs'],                                  fill:'#ecdcec', stroke:'#8a4a8a' },
    { id:'dss',      label:'DSS / Shim',      prefixes:['dss','DSS'],                                  fill:'#ececdc', stroke:'#8a8a4a' },
    { id:'roce',     label:'RoCE',            prefixes:['RoCE','ROCE','roce'],                         fill:'#dcecf4', stroke:'#4a98b8' },
    { id:'overflow', label:'Overflow',        prefixes:['OVERFLOW','overflow','OVF'],                  fill:'#f4dcdc', stroke:'#b85a5a' },
    { id:'fdp',      label:'FDP',             prefixes:['FDP'],                                        fill:'#dcf0f0', stroke:'#4a9898' },
    { id:'ring',     label:'Ring',            prefixes:['RING'],                                       fill:'#ecdcec', stroke:'#8a4a78' },
  ],

  _custom: [],

  match(value) {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    const all = [...this._custom, ...this.categories];
    for (const cat of all) {
      for (const p of cat.prefixes) {
        if (v === p) return cat;
        if (v.startsWith(p)) {
          // Single-char prefixes (like "U") must be followed by space, digit, or end
          // to avoid matching "US-DTN01..." as Unallocated
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
  },

  loadCustom() {
    try {
      const s = localStorage.getItem('bp_custom_types');
      if (s) this._custom = JSON.parse(s);
    } catch(e) {}
  }
};
TypeLibrary.loadCustom();
