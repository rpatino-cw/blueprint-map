// Comparison engine — compare LayoutParser output against reference ground truth
// Usage: const { compareHall, compareSite } = require('./compare');

function extractHallNumber(name) {
  // "Data Hall 1" → 1, "DH3" → 3, "DH201" → 201, "L1" → 1, "U1" → 1
  // "Data Hall 101" → 101, "Sector 2" → 2, "DC2" → 2, "DC7" → 7
  const m = name.match(/(?:Data\s*Hall|DH|Hall|L|U|S|Sector|DC)\s*(\d+)/i);
  return m ? +m[1] : null;
}

function extractHallLetter(name) {
  // "Data Hall B" → "B", "BUILDING E" → "E", "DHA" → "A"
  const m = name.match(/(?:Data\s*Hall|DH|Building|BLDG)\s+([A-Z])\b/i)
         || name.match(/\b([A-Z])\s*$/);
  return m ? m[1].toUpperCase() : null;
}

function extractSectorNumber(name) {
  // "US-SPK02 Sector 2" → 2, "Sector 4" → 4
  const m = name.match(/Sector\s*(\d+)/i);
  return m ? +m[1] : null;
}

function extractDCNumber(name) {
  // "Data Hall DC2" → 2, "DC7" → 7
  const m = name.match(/DC(\d+)/i);
  return m ? +m[1] : null;
}

function compareHall(parseResult, refHall) {
  const hallName = refHall.datahall;

  const prHall = parseResult.halls.find(h => {
    const hn = (h.name || '').replace(/\s+/g, '').toLowerCase();
    const target = hallName.replace(/\s+/g, '').toLowerCase();

    // Direct match
    if (hn === target) return true;
    // One contains the other
    if (hn.includes(target) || target.includes(hn)) return true;

    // Numeric hall matching: "Data Hall 1" ↔ "DH1"
    const refNum = extractHallNumber(hallName);
    if (refNum !== null) {
      if (h.hallNum === refNum) return true;
      const parserNum = extractHallNumber(h.name || '');
      if (parserNum === refNum) return true;
    }

    // Letter hall matching: "Data Hall B" ↔ "BUILDING B"
    const refLetter = extractHallLetter(hallName);
    if (refLetter) {
      const parserLetter = extractHallLetter(h.name || '');
      if (parserLetter === refLetter) return true;
    }

    // Sector matching: "US-SPK02 Sector 2" ↔ "Layout" (single hall with all racks)
    // Can't match sectors to a single "Layout" hall — handled at site level

    // DC-prefix matching: "Data Hall DC2" → look for section/hall with number 2
    const refDC = extractDCNumber(hallName);
    if (refDC !== null) {
      const parserNum = extractHallNumber(h.name || '');
      if (parserNum === refDC) return true;
      // "Section 2" ↔ "DC2"
      const secMatch = (h.name || '').match(/Section\s*(\d+)/i);
      if (secMatch && +secMatch[1] === refDC) return true;
    }

    return false;
  });

  if (!prHall) {
    return {
      status: 'HALL_NOT_FOUND',
      datahall: hallName,
      expected_racks: refHall.expected_rack_count,
      found_racks: 0,
      delta: -refHall.expected_rack_count,
      accuracy: 0,
      missing_racks: refHall.rack_labels.slice(0, 20),
      extra_racks: [],
      missing_count: refHall.rack_labels.length,
      extra_count: 0,
      details: `Parser did not detect hall "${hallName}"`,
    };
  }

  // Collect racks through all hierarchy paths
  const prRacks = collectRacks(prHall);
  const prCount = prRacks.length;
  const refCount = refHall.expected_rack_count;
  const delta = prCount - refCount;

  const refLabels = new Set(refHall.rack_labels);
  const prLabels = new Set(prRacks);
  const missing = [...refLabels].filter(l => !prLabels.has(l));
  const extra = [...prLabels].filter(l => !refLabels.has(l));

  // PASS if parser found all reference racks (extra racks are fine — parser found more)
  const allRefFound = missing.length === 0;

  return {
    status: allRefFound ? 'PASS' : 'DELTA',
    datahall: hallName,
    expected_racks: refCount,
    found_racks: prCount,
    delta,
    accuracy: refCount > 0 ? Math.round((1 - missing.length / refCount) * 1000) / 10 : 0,
    missing_racks: missing.slice(0, 20),
    extra_racks: extra.slice(0, 20),
    missing_count: missing.length,
    extra_count: extra.length,
  };
}

function collectRacks(hall) {
  const racks = [];

  // Path 1: hall.sections[].blocks[].rackNums
  if (hall.sections) {
    for (const section of hall.sections) {
      for (const block of (section.blocks || [])) {
        racks.push(...(block.rackNums || []));
      }
    }
  }

  // Path 2: hall.grids[].pods[].sections[].blocks[].rackNums
  if (racks.length === 0 && hall.grids) {
    for (const grid of hall.grids) {
      for (const pod of (grid.pods || [])) {
        for (const section of (pod.sections || [])) {
          for (const block of (section.blocks || [])) {
            racks.push(...(block.rackNums || []));
          }
        }
      }
      for (const gg of (grid.gridGroups || [])) {
        for (const pod of (gg.pods || [])) {
          for (const section of (pod.sections || [])) {
            for (const block of (section.blocks || [])) {
              racks.push(...(block.rackNums || []));
            }
          }
        }
      }
    }
  }

  return racks;
}

function compareSite(parseResult, refHalls) {
  const results = refHalls.map(rh => compareHall(parseResult, rh));
  const totalExpected = refHalls.reduce((s, h) => s + h.expected_rack_count, 0);
  const totalFound = results.reduce((s, r) => s + r.found_racks, 0);
  const parserTotalRacks = parseResult.totalRacks || 0;

  return {
    halls: results,
    total_expected: totalExpected,
    total_found: totalFound,
    total_delta: totalFound - totalExpected,
    pass_count: results.filter(r => r.status === 'PASS').length,
    total_halls: results.length,
    site_accuracy: totalExpected > 0 ? Math.round((1 - Math.abs(totalFound - totalExpected) / totalExpected) * 1000) / 10 : 0,
    parser_total_racks: parserTotalRacks,
    flat_delta: parserTotalRacks - totalExpected,
    flat_accuracy: totalExpected > 0 ? Math.round(Math.min(parserTotalRacks, totalExpected) / totalExpected * 1000) / 10 : 0,
    hall_distribution_ok: totalFound === parserTotalRacks,
  };
}

module.exports = { compareHall, compareSite, collectRacks };
