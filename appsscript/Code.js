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
      // Mint the token here and hand it to signin.html via URL fragment.
      // Why fragment: access=DOMAIN prevents cross-origin JSONP (no 3P cookie
      // = no session = Google redirects to sign-in). Fragments never reach
      // servers, so the token stays client-side.
      // Why a visible link + target="_top": Apps Script serves this HTML
      // inside a sandboxed iframe with allow-top-navigation-by-user-activation.
      // A programmatic top.location.replace without prior user activation is
      // blocked, so the popup sits on "Signed in" forever. A real anchor the
      // user clicks generates activation, and target="_top" breaks out of the
      // sandbox. We still attempt auto-redirect for browsers that allow it.
      var authToken = Utilities.getUuid();
      CacheService.getScriptCache().put("bp_tk_" + authToken, email, 3600);
      var redirectUrl = "https://rpatino-cw.github.io/blueprint-map/signin.html" +
        "#a=" + encodeURIComponent(authToken) +
        "&e=" + encodeURIComponent(email);
      var redirectUrlAttr = redirectUrl.replace(/&/g, "&amp;");
      html =
        '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Signed in</title>' +
        '<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f5f5f7;display:flex;align-items:center;justify-content:center;min-height:100vh}' +
        '.c{background:#fff;padding:40px 32px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.06);text-align:center;max-width:360px}' +
        '.ck{width:56px;height:56px;margin:0 auto 16px;background:#ebf9ef;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;color:#22a556;font-weight:700}' +
        'h1{font-size:18px;margin:0 0 8px;color:#1d1d1f;font-weight:600}p{font-size:13px;color:#6e6e73;margin:0;line-height:1.5}' +
        '.email{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:#6e6e73;margin-top:10px}' +
        '.btn{display:inline-block;margin-top:20px;padding:11px 22px;border-radius:10px;background:#1d1d1f;color:#fff;text-decoration:none;font-size:14px;font-weight:500}' +
        '.btn:hover{opacity:.92}' +
        '</style>' +
        '</head><body>' +
        '<div class="c"><div class="ck">&#10003;</div><h1>Signed in</h1>' +
        '<p>Click Continue to return to Blueprint Map.</p>' +
        '<a class="btn" id="continue-btn" href="' + redirectUrlAttr + '" target="_top" rel="noopener">Continue to Blueprint Map</a>' +
        '<div class="email">' + email + '</div></div>' +
        '<script>' +
        '(function(){' +
          'var url=' + JSON.stringify(redirectUrl) + ';' +
          // Best-effort auto-redirect — works when the sandbox allows top nav
          // (same Google session, no recent COOP event). Fails silently in
          // Incognito; user clicks the visible button instead.
          'try{if(window.top&&window.top!==window){window.top.location.replace(url)}else{location.replace(url)}}catch(e){}' +
        '})();' +
        '</script>' +
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

  // Token mint endpoint — called as JSONP from signin.html after a successful
  // Google auth redirect. Uses the fresh Google session to validate domain,
  // then mints a UUID token cached server-side for 1 h. The client then passes
  // ?token=... on subsequent data fetches. Token never appears in any URL.
  if (params.mode === "token") {
    var tokenEmail = Session.getActiveUser().getEmail() || "";
    var tokenAuthed = tokenEmail.indexOf("@coreweave.com") > -1;
    var tokenBody;
    if (tokenAuthed) {
      var newToken = Utilities.getUuid();
      CacheService.getScriptCache().put("bp_tk_" + newToken, tokenEmail, 3600);
      tokenBody = JSON.stringify({ token: newToken, email: tokenEmail });
    } else {
      tokenBody = JSON.stringify({ error: "AUTH" });
    }
    if (params.callback) return ContentService.createTextOutput(params.callback + "(" + tokenBody + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(tokenBody).setMimeType(ContentService.MimeType.JSON);
  }

  // Auth gate: require a valid session token OR an active CoreWeave Google session.
  // access: ANYONE_ANONYMOUS lets doGet run so token validation can handle auth
  // without Google's infrastructure blocking the request before code executes.
  var authOk = false;
  if (params.token) {
    var cachedEmail = CacheService.getScriptCache().get("bp_tk_" + params.token);
    authOk = !!(cachedEmail && cachedEmail.indexOf("@coreweave.com") > -1);
  } else {
    // Fallback: session cookie (works in browsers that still allow 3P cookies)
    var sessionEmail = Session.getActiveUser().getEmail() || "";
    authOk = sessionEmail.indexOf("@coreweave.com") > -1;
  }
  if (!authOk) {
    var authErr = JSON.stringify({ error: "AUTH" });
    if (params.callback) return ContentService.createTextOutput(params.callback + "(" + authErr + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(authErr).setMimeType(ContentService.MimeType.JSON);
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