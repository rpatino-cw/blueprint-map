const sm = require('./site-map.json');
const done = ['US-EVI01', 'US-DGV01'];
const sites = sm.sites.filter(s => !done.includes(s.locode));
for (const s of sites) {
  console.log(s.locode + '|' + s.sheetId);
}
console.error('Remaining: ' + sites.length);
