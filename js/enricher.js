// Enricher — overlays authoritative metadata from NetBox onto parser output.
//
// The parser reports whatever the Google Sheet claims about itself ("US-PPY01",
// "DATA HALL 1", etc.). NetBox is the source of truth for LOCODE and facility.
// This layer reconciles the two so the renderer shows the NetBox identity
// while the parser still owns everything structural (racks, halls, grids).
//
// Public API:
//   Enricher.setSitesMeta(data)         // call once after sites.json loads
//   Enricher.enrich(parseResult, sheetId)  // call after each parse

(function (global) {
  const byId = new Map();

  function setSitesMeta(data) {
    byId.clear();
    if (!data || !Array.isArray(data.sites)) return;
    for (const s of data.sites) {
      if (s.sheetId) byId.set(s.sheetId, s);
    }
  }

  function enrich(parseResult, sheetId) {
    if (!parseResult || !sheetId) return parseResult;
    const meta = byId.get(sheetId);
    if (!meta) return parseResult;

    const sheetSite = parseResult.site || null;

    // Preserve what the sheet said — useful for audit and for the renderer
    // to surface an "in-sheet labelled X" note when it disagrees with NetBox.
    parseResult.sheetSite = sheetSite;
    parseResult.netboxSite = meta.name;
    parseResult.netboxFacility = meta.facility || null;
    parseResult.sheetMismatch = !!(sheetSite && meta.name &&
      sheetSite.toUpperCase() !== meta.name.toUpperCase() &&
      !sheetSite.toUpperCase().endsWith('-' + meta.name.toUpperCase()) &&
      !meta.name.toUpperCase().endsWith('-' + sheetSite.toUpperCase()));

    // NetBox wins for display identity. Parser keeps structure untouched.
    parseResult.site = meta.name;

    return parseResult;
  }

  global.Enricher = { setSitesMeta, enrich };
})(typeof window !== 'undefined' ? window : globalThis);
