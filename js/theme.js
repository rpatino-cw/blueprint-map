// Theme — single global visual contract for the blueprint map.
// Renderer reads Theme.cab.* and Theme.labels.* instead of hardcoded constants.
// Flip a flag here to restore any hidden label without touching render logic.

(function (global) {
  const Theme = {
    cab: { width: 64, height: 44, radius: 7, gap: 4 },
    hall: { padOuter: 22, padY: 22, minGap: 40, showCornerNumber: true },
    labels: {
      showSiteTitle: false,
      showHallName: false,
      showRowLabels: false,
      showExternalRackNumbers: false,
      showTypeLabels: false,
      rackNumberInside: true,
    },
    glow: { mode: 'hover-only' },
    tooltip: { enabled: true, showType: true },
    typeLibrary: { allowCustomPrefixes: false },
  };
  global.Theme = Theme;
})(typeof window !== 'undefined' ? window : globalThis);
