/**
 * Blueprint Parser — Google Apps Script JSON Exporter
 * Extends the existing doGet with backgrounds, merges, and named ranges.
 *
 * Params (all optional):
 *   ?id=SHEET_ID        — spreadsheet ID (default: US-EVI01 master)
 *   ?tab=OVERHEAD       — sheet tab name (default: OVERHEAD)
 *   ?mode=rich          — return full data (cells + backgrounds + merges + namedRanges)
 *   ?mode=cells         — return cells only (default, backwards-compatible)
 *   ?callback=fn        — JSONP wrapper
 *
 * Backwards compatible: without ?mode=rich, returns the same flat 2D array as before.
 */
function doGet(e) {
  var params = e ? e.parameter : {};

  // Friendly auth popup — returns HTML that auto-closes instead of raw JSON.
  // Called from signin.html's "Continue with Google" popup.
  if (params.mode === "signin") {
    var email = Session.getActiveUser().getEmail() || "";
    var authed = email.indexOf("@coreweave.com") > -1;
    var html;
    if (authed) {
      html =
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Signed in</title>' +
        '<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f5f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
        '.c{background:#fff;padding:40px 32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center;max-width:320px}' +
        '.ck{width:56px;height:56px;margin:0 auto 16px;background:#ebf9ef;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;color:#22a556;font-weight:700}' +
        'h1{font-size:18px;margin:0 0 8px;color:#1d1d1f;font-weight:600}p{font-size:13px;color:#6e6e73;margin:0;line-height:1.5}' +
        '.email{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:#6e6e73;margin-top:10px}</style></head><body>' +
        '<div class="c"><div class="ck">&#10003;</div><h1>Signed in</h1><p>Closing automatically&hellip;</p>' +
        '<div class="email">' + email + '</div></div>' +
        '<script>try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:"bp-auth-success",email:' + JSON.stringify(email) + '},"*")}catch(e){}setTimeout(function(){try{window.close()}catch(e){}},700)</script>' +
        '</body></html>';
    } else {
      html =
        '<!DOCTYPE html><html><body style="margin:0;font-family:system-ui,sans-serif;background:#f5f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh"><div style="background:#fff;padding:40px 32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center;max-width:340px">' +
        '<h1 style="font-size:18px;margin:0 0 8px;color:#1d1d1f">Access denied</h1>' +
        '<p style="font-size:13px;color:#6e6e73;margin:0;line-height:1.5">This tool requires a <strong>@coreweave.com</strong> Google account. You can close this tab.</p>' +
        '</div></body></html>';
    }
    return HtmlService.createHtmlOutput(html)
      .setTitle("Blueprint Map — Signing in")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  var sheetId = params.id || "1dtuaNuDuLPGzqkUb6pBOBM-meeoEioGata3xGkq-zgI";
  var tabName = params.tab || "OVERHEAD";
  var mode = params.mode || "cells";
  var callback = params.callback;

  var source = SpreadsheetApp.openById(sheetId);
  var sheet = source.getSheetByName(tabName);

  if (!sheet) {
    var err = JSON.stringify({ error: "Tab not found: " + tabName });
    if (callback) return ContentService.createTextOutput(callback + "(" + err + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(err).setMimeType(ContentService.MimeType.JSON);
  }

  var range = sheet.getDataRange();
  var values = range.getValues().map(function(row) {
    return row.map(function(cell) { return cell === null ? "" : String(cell); });
  });

  // Default mode: return flat 2D array (backwards compatible)
  if (mode !== "rich") {
    var json = JSON.stringify(values);
    if (callback) return ContentService.createTextOutput(callback + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // Rich mode: cells + backgrounds + merges + named ranges
  var backgrounds = range.getBackgrounds();

  var mergedRanges = sheet.getMergedRanges();
  var merges = mergedRanges.map(function(mr) {
    return { r1: mr.getRow(), c1: mr.getColumn(), r2: mr.getLastRow(), c2: mr.getLastColumn() };
  });

  var allNamed = source.getNamedRanges();
  var sid = sheet.getSheetId();
  var namedRanges = allNamed
    .filter(function(nr) { return nr.getRange().getSheet().getSheetId() === sid; })
    .map(function(nr) {
      var r = nr.getRange();
      return { name: nr.getName(), r1: r.getRow(), c1: r.getColumn(), r2: r.getLastRow(), c2: r.getLastColumn() };
    });

  var result = {
    meta: {
      spreadsheetId: source.getId(),
      title: source.getName(),
      tab: tabName,
      rows: values.length,
      cols: values.length > 0 ? values[0].length : 0,
      exportedAt: new Date().toISOString()
    },
    cells: values,
    backgrounds: backgrounds,
    merges: merges,
    namedRanges: namedRanges
  };

  var json = JSON.stringify(result);
  if (callback) return ContentService.createTextOutput(callback + "(" + json + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}