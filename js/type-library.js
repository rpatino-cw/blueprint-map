// ════════════════════════════════════════════════════════════════
// TYPE LIBRARY
// Data-driven rack type matching via prefix patterns.
// New hardware (HD-GB4c, T0-E-v11a) matches automatically.
// ════════════════════════════════════════════════════════════════

const TypeLibrary = {
  categories: [
    { id:'compute',  label:'Compute',        prefixes:['HD-B2','HD-GB','H1 x','H1-','H2 x','H2-'],   fill:'#0d2b3d', stroke:'#4a9ec4' },
    { id:'ib-spine', label:'IB Spine',        prefixes:['IB x','IB-'],                                fill:'#330d1f', stroke:'#c45a8a' },
    { id:'xdr',      label:'XDR Spine',       prefixes:['XDR'],                                       fill:'#33200d', stroke:'#c4955a' },
    { id:'sc',       label:'Spine Connector', prefixes:['SC-'],                                       fill:'#1f0d33', stroke:'#8a5cc4' },
    { id:'tor',      label:'TOR / Edge',      prefixes:['T0-EOR','T0+IB','T0-E','T1-E','T2-E','T3-E','EDGE-','EDGE '], fill:'#0d3324', stroke:'#4ac49a' },
    { id:'frontend', label:'Frontend',        prefixes:['T0-FE','T1-FE','T2-FE','T0-RO','T1-RO'],     fill:'#1f330d', stroke:'#95c45a' },
    { id:'dpr',      label:'DPR',             prefixes:['DPR','dpu-','DPU'],                            fill:'#33330d', stroke:'#c4c45a' },
    { id:'fcr',      label:'FCR',             prefixes:['FCR-','FCR'],                                fill:'#33290d', stroke:'#c4a65a' },
    { id:'ms-sec',   label:'MS-SEC',          prefixes:['MS-SEC','MS-'],                              fill:'#331a1a', stroke:'#c45a5a' },
    { id:'core',     label:'Core / Spine',    prefixes:['CP','C-C','C-1','C1','C2','C3','C4','C5','C6','C7','C8'], fill:'#200d33', stroke:'#955ac4' },
    { id:'storage',  label:'Storage',         prefixes:['V x','VAST'],                                fill:'#0d1f33', stroke:'#5a8ac4' },
    { id:'fabric',   label:'Fabric',          prefixes:['Fab'],                                       fill:'#1a1a0d', stroke:'#8a8a3a' },
    { id:'spine-sw', label:'Spine Switch',    prefixes:['S1-','S3-','S5-','S7-','S1 ','S5 ','S9 ','S13','S17','S21','S25','S29','S33','S37','S41','S45','S49','S53','S57','S61','S65','S69'], fill:'#0d2933', stroke:'#5ab4c4' },
    { id:'reserved', label:'Reserved',        prefixes:['RES'],                                       fill:'#111118', stroke:'#3a3a4a' },
    { id:'unalloc',  label:'Unallocated',     prefixes:['U'],                                         fill:'#0a0e16', stroke:'#222838' },
    { id:'mgmt',     label:'Management',      prefixes:['mgmt-core','net-agg','net-dist','comp-agg','comp-dist','grid-agg','pod-dist','infra-dist','infra-sw'], fill:'#1a2a1a', stroke:'#5a9a5a' },
    { id:'firewall', label:'Firewall',        prefixes:['oob-fw','FW-'],                              fill:'#331a1a', stroke:'#c45a5a' },
    { id:'console',  label:'Console / OOB',   prefixes:['con-','OG-','opengear'],                     fill:'#1a1a2a', stroke:'#6a6ac4' },
    { id:'pkey',     label:'PKey',            prefixes:['PKey','pkey'],                                fill:'#2a2a1a', stroke:'#9a9a5a' },
    { id:'t-tier',   label:'T-Tier Spine',    prefixes:['T4-','T3-','T2-','T1-','T0-'],               fill:'#1a2a33', stroke:'#5a9ac4' },
    { id:'fbs',      label:'FBS',             prefixes:['FBS','fbs'],                                  fill:'#2a1a2a', stroke:'#9a5a9a' },
    { id:'dss',      label:'DSS / Shim',      prefixes:['dss','DSS'],                                  fill:'#2a2a1a', stroke:'#9a9a3a' },
    { id:'roce',     label:'RoCE',            prefixes:['RoCE','ROCE','roce'],                         fill:'#1a2a33', stroke:'#5ab4c4' },
    { id:'overflow', label:'Overflow',        prefixes:['OVERFLOW','overflow','OVF'],                  fill:'#2a1a1a', stroke:'#9a5a5a' },
  ],

  _custom: [],

  match(value) {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    const all = [...this._custom, ...this.categories];
    for (const cat of all) {
      for (const p of cat.prefixes) {
        if (v === p || v.startsWith(p)) return cat;
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
