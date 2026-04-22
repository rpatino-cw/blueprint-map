# Blueprint Map — project rules

## HARD CONSTRAINTS (verified with Romeo — do NOT re-ask)

**No external sharing of CoreWeave Google data.** CoreWeave Workspace blocks sharing any internal Google file (Sheets, Docs, Drive) with any email outside `@coreweave.com`. This has been confirmed — Google Sheets UI shows "Your admin doesn't allow sharing outside your organization." Any architecture that relies on sharing a CW-owned sheet with a service account, personal Gmail, or any non-CW email is **dead on arrival**.

**No Google Workspace admin access.** Romeo is not a Google admin at CoreWeave and will never be. Any solution requiring admin tickets (external-sharing whitelists, domain-wide delegation, org-level GCP project creation) is off the table.

**No CW gcloud auth.** Romeo cannot `gcloud auth login` with his `@coreweave.com` account — CW Workspace blocks the OAuth consent for gcloud. `gcloud` only works with his personal Gmail. A personal GCP project is fine for things that don't need CW data access.

**No GCP project creation under `@coreweave.com`.** CW Workspace requires every GCP project created by a `@coreweave.com` account to have a parent organization or folder. Romeo has no access to a parent org or folder he can select. The "No organization" option is visible in the Browse dialog but the Select button is **disabled** — verified 2026-04-21 via Playwright. Practical effect: any architecture requiring a GCP project (OAuth clients, service accounts, API keys) must use a personal Google account, OR live entirely inside an existing Apps Script project (which auto-provisions its own hidden GCP project managed by Google).

## Implications for architecture

- Cloudflare Worker + service account proxy: **NOT VIABLE**. Service account can't read CW sheets because CW-owned sheets can't be shared with it.
- Apps Script deployment: **STAYS**. Runs inside CW Workspace, has legitimate access to CW sheets as the owner.
- Direct browser-to-Sheets-API via user OAuth: **VIABLE**. User provides their own `@coreweave.com` OAuth access token, Google Sheets API authorizes based on the user's own sheet access. No external sharing, no service account, no admin.
- Apps Script API (`scripts.run`) with user OAuth token: **VIABLE**. Same idea — user's own credentials, Apps Script runs as them. Keeps Apps Script's existing parsing logic server-side.

## Known-broken contexts

- Chrome Incognito. Third-party cookies blocked by default, so cross-origin JSONP to `script.google.com` fails under DOMAIN access. Only fix: get off cookie-based cross-origin auth entirely. Bearer headers work; cookies don't.
- Safari with ITP. Same as Incognito.
- Any browser with 3P cookies disabled.

## Deployment constraints

- Apps Script `access: ANYONE_ANONYMOUS` is **banned** by CW Workspace. Any deploy that tries to set it will fail with "ANYONE access has been disabled by your domain administrator." Use `DOMAIN` access only.
- Apps Script HTML runs inside a sandboxed iframe with `allow-top-navigation-by-user-activation`. Programmatic `top.location.replace` on page load is blocked; use a visible anchor with `target="_top"` that the user clicks.
- Apps Script deployment URL: `https://script.google.com/a/macros/coreweave.com/s/AKfycbw_DYXJFneaL7C-6xP4L2XxvlJN9wm0sIEZZWC_aDEygfj5vFUPk98iDV4oUy8r45Bt/exec`. Deployment ID is baked into the client; `npm run apps:deploy` reuses it automatically.

## Project pointers

- Parser: `js/parser.js` (1368 lines)
- Renderer: `js/renderer.js`
- NetBox enricher: `js/enricher.js`
- Main app: `js/app.js`
- Sign-in popup: `signin.html`
- Regression runner: `test/regression/run-offline.js`
- Fixtures: `test/fixtures/*.csv`
- Apps Script source: `appsscript/Code.js`
- Reference data (authoritative expected hall counts): `test/regression/reference-data.json`

## Rules for future auth work

1. Before proposing any auth architecture, re-read this file. If it involves an external email address anywhere, stop.
2. Prefer user-OAuth (Bearer token sent by the browser with the user's credentials) over service accounts.
3. Don't ask Romeo to "just try" anything that might require admin — the answer is always "he doesn't have admin."
4. Same-origin is easier than cross-origin. If a solution involves cross-origin requests, make sure it uses bearer headers (not cookies) so it survives 3P cookie blocking.
