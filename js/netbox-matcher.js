// ════════════════════════════════════════════════════════════════
// NETBOX LOCATION MATCHER
// Ported from coreweave/overhead2svg (Go → JS)
// Maps parser hall names / SPLAT named ranges to NetBox location slugs.
//
// Usage:
//   const loc = matchLocation('US_DTN01_DATAHALL_DHG', '_DATAHALL_', locations);
//   // loc = { id: 1, slug: 'data-hall-g', name: 'Data Hall G', parent: {...} }
//
//   const loc2 = matchHall('DH1', locations);
//   // Convenience wrapper for parser hall names (no named range prefix)
// ════════════════════════════════════════════════════════════════

/**
 * Expand a normalised segment into all known abbreviation variants
 * so they can be matched against NetBox slugs and names.
 *
 *   "dhc"  → ["dhc", "c"]               (strip "dh")
 *   "sa"   → ["sa", "sector-a"]         (expand "s" → "sector-")
 *   "u1"   → ["u1", "underground-1"]    (expand "u" → "underground-")
 *   "f1"   → ["f1", "floor-1"]          (expand "f" → "floor-")
 */
function buildCandidates(part) {
  const candidates = [part];
  if (part.startsWith('dh')) {
    candidates.push(part.slice(2));
  }
  if (part.startsWith('s') && part.length > 1) {
    candidates.push('sector-' + part.slice(1));
  }
  if (part.startsWith('u') && part.length > 1) {
    candidates.push('underground-' + part.slice(1));
  }
  if (part.startsWith('f') && part.length > 1) {
    candidates.push('floor-' + part.slice(1));
  }
  return candidates;
}

/**
 * Reports whether s contains seg as a complete hyphen-delimited token.
 */
function containsSegment(s, seg) {
  return s === seg ||
    s.startsWith(seg + '-') ||
    s.endsWith('-' + seg) ||
    s.includes('-' + seg + '-');
}

/**
 * Reports whether s contains word as a complete space-delimited token.
 */
function containsWord(s, word) {
  return s === word ||
    s.startsWith(word + ' ') ||
    s.endsWith(' ' + word) ||
    s.includes(' ' + word + ' ');
}

/**
 * Reports whether any candidate matches slug, relSlug, or name.
 * Slug and name matching use whole-token boundaries (hyphens / spaces)
 * to avoid false positives like "h" matching "data-hall-b" via "hall".
 */
function segmentMatches(slug, parentSlug, name, candidates) {
  const relSlug = parentSlug && slug.startsWith(parentSlug + '-')
    ? slug.slice(parentSlug.length + 1)
    : slug;
  for (const c of candidates) {
    if (relSlug === c) return true;
    // Whole-segment match in full slug or relative slug.
    if (containsSegment(slug, c) || containsSegment(relSlug, c)) return true;
    // Candidate contains slug as a substring (e.g. slug="dh", c="dhc").
    if (c.includes(slug)) return true;
    // Whole-word match in name.
    if (containsWord(name, c)) return true;
    // Candidate contains name as a substring (e.g. name="c", c="dhc").
    if (c.includes(name)) return true;
  }
  return false;
}

/**
 * Find the NetBox location whose name or slug best matches the DH segment
 * of a named range (the part after filter, e.g. "_DATAHALL_").
 *
 * For flat hierarchies (locode → data hall) the DH segment is matched
 * directly. For two-level hierarchies (locode → floor → data hall) the
 * segment is parsed as F<x>DH<y> and both parts are matched independently.
 *
 * @param {string} rangeName - e.g. "US_DTN01_DATAHALL_DHG"
 * @param {string} filter - e.g. "_DATAHALL_"
 * @param {Array<{id,slug,name,parent:{slug,name,parent?:{slug,name}}}>} locations
 * @returns {object|null} The matched location or null
 */
function matchLocation(rangeName, filter, locations) {
  if (!filter || !locations || locations.length === 0) return null;
  const idx = rangeName.indexOf(filter);
  if (idx < 0) return null;
  // Normalise: lowercase, underscores → hyphens.
  const dhPart = rangeName.slice(idx + filter.length).toLowerCase().replace(/_/g, '-');
  if (!dhPart) return null;

  // Try to parse a compound F<x>DH<y> segment for two-level hierarchies.
  // e.g. "f1dhc" → floorPart="f1", dhSubPart="dhc"
  let floorPart = '';
  let dhSubPart = '';
  if (dhPart.startsWith('f')) {
    const dhIdx = dhPart.indexOf('dh', 1);
    if (dhIdx >= 0) {
      floorPart = dhPart.slice(0, dhIdx);
      dhSubPart = dhPart.slice(dhIdx);
    }
  }

  const candidates = buildCandidates(dhPart);

  for (const loc of locations) {
    const slug = (loc.slug || '').toLowerCase();
    const name = (loc.name || '').toLowerCase();
    const parentSlug = (loc.parent?.slug || '').toLowerCase();

    // Two-level match: F<x>DH<y> against (floor parent, data hall loc).
    if (floorPart && loc.parent?.parent) {
      const floorSlug = (loc.parent.slug || '').toLowerCase();
      const floorName = (loc.parent.name || '').toLowerCase();
      const grandSlug = (loc.parent.parent.slug || '').toLowerCase();
      if (segmentMatches(floorSlug, grandSlug, floorName, buildCandidates(floorPart)) &&
          segmentMatches(slug, parentSlug, name, buildCandidates(dhSubPart))) {
        return loc;
      }
    }

    // Flat match: single-level (locode → data hall). Skip when a two-level
    // pattern was detected so that floor nodes are never accidentally matched.
    if (!floorPart && segmentMatches(slug, parentSlug, name, candidates)) {
      return loc;
    }
  }
  return null;
}

/**
 * Convenience: match a parser hall name (e.g. "DH1", "DH201", "BUILDING E")
 * directly against NetBox locations without a named range prefix.
 *
 * Normalises the hall name the same way matchLocation normalises the DH segment:
 * lowercase, spaces/underscores → hyphens, then runs candidate matching.
 *
 * @param {string} hallName - from parser result (e.g. "DH1", "DH201", "BUILDING E")
 * @param {Array} locations - NetBox locations array
 * @returns {object|null}
 */
function matchHall(hallName, locations) {
  if (!hallName || !locations || locations.length === 0) return null;
  const normalised = hallName.toLowerCase().replace(/[\s_]+/g, '-');
  const candidates = buildCandidates(normalised);

  for (const loc of locations) {
    const slug = (loc.slug || '').toLowerCase();
    const name = (loc.name || '').toLowerCase();
    const parentSlug = (loc.parent?.slug || '').toLowerCase();
    if (segmentMatches(slug, parentSlug, name, candidates)) {
      return loc;
    }
  }
  return null;
}

// Module export (for Worker/Node)
if (typeof module !== 'undefined') module.exports = { buildCandidates, containsSegment, containsWord, segmentMatches, matchLocation, matchHall };
