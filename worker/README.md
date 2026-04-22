# bp-proxy — Cloudflare Worker

Proxies Google Sheets reads for Blueprint Map. Replaces the cross-origin JSONP path to Apps Script that couldn't work in Incognito.

Architecture is documented in the parent plan: `~/.claude/plans/stateful-wandering-parrot.md`.

---

## One-time setup

### 1. GCP project + OAuth client + service account

Using Romeo's personal Google account (not CoreWeave-managed) so we have admin rights on the project.

```bash
# Create project (or reuse existing)
gcloud projects create blueprint-map-proxy --name="Blueprint Map Proxy"
gcloud config set project blueprint-map-proxy

# Enable the Sheets API
gcloud services enable sheets.googleapis.com

# Create the service account
gcloud iam service-accounts create bp-proxy-reader \
  --display-name="Blueprint Map Proxy Reader"

# Create a JSON key — save this file; we'll upload it to Cloudflare as a secret
gcloud iam service-accounts keys create ~/bp-proxy-sa.json \
  --iam-account=bp-proxy-reader@blueprint-map-proxy.iam.gserviceaccount.com

# The service-account email you'll share sheets with:
gcloud iam service-accounts list --format="value(email)"
```

The **OAuth 2.0 Client ID** is not yet available via gcloud CLI — must be created via the Console:

1. Open https://console.cloud.google.com/apis/credentials?project=blueprint-map-proxy
2. Create Credentials → OAuth client ID → Web application
3. Name: "Blueprint Map GIS"
4. Authorized JavaScript origins: `https://rpatino-cw.github.io`
5. (No redirect URIs needed — GIS token client only.)
6. Copy the Client ID.

If prompted to configure the OAuth consent screen first: User Type = Internal (CoreWeave), app name = "Blueprint Map", user support email = your @cw.com, scopes = `openid email profile`, test users = you.

### 2. Share overhead sheets with the service account

Grant `bp-proxy-reader@blueprint-map-proxy.iam.gserviceaccount.com` **Viewer** access on every sheet listed in `../index.html`.

Quickest batch approach (requires Python + a list of sheet IDs):

```bash
# Enable Drive API first (gcloud services enable drive.googleapis.com)
pip install google-api-python-client google-auth

# See scripts/share-sheets.py (template — adapt to your sheet list)
```

Or just open each sheet and Share → paste the SA email → Viewer → Save. ~50 sheets, 15 minutes.

### 3. Cloudflare Worker setup

```bash
cd ~/dev/blueprint-map/worker

# One-time: log into Cloudflare (opens browser)
npx wrangler login

# Upload secrets
cat ~/bp-proxy-sa.json | npx wrangler secret put GOOGLE_SA_KEY
echo "<paste-your-oauth-client-id>" | npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID

# Deploy
npx wrangler deploy
```

After deploy, note the URL printed (format: `https://bp-proxy.<your-subdomain>.workers.dev`). Bake this into `index.html` as `window.BP_PROXY_URL`.

---

## Local development

```bash
# Create a .dev.vars file (gitignored) mirroring the production secrets
cat > .dev.vars <<EOF
GOOGLE_SA_KEY='$(cat ~/bp-proxy-sa.json | tr -d '\n')'
GOOGLE_OAUTH_CLIENT_ID="<your-client-id>"
EOF

npx wrangler dev
# Worker listens on http://localhost:8787
```

Test:

```bash
# Get an ID token from your browser DevTools after signing in via GIS:
#   sessionStorage.getItem('bp_id_token')
# Then:
curl -H "Authorization: Bearer <paste>" \
  'http://localhost:8787/sheet?id=1dtuaNuDuLPGzqkUb6pBOBM-meeoEioGata3xGkq-zgI&tab=OVERHEAD' \
  | jq '.meta, (.cells | length)'
```

Expected: a `meta` object plus the row count of the US-EVI01 sheet.

---

## Maintenance

- **Rotate the service-account key** every 90 days: re-run `gcloud iam service-accounts keys create`, upload as secret, delete the old key.
- **Add a new sheet**: share it with `bp-proxy-reader@...` as Viewer. No code change needed.
- **Revoke a user**: they lose `hd=coreweave.com` when disabled in CW Workspace → their ID tokens stop validating.

## Observability

- `npx wrangler tail` — live tail of Worker logs in your terminal.
- Cloudflare dashboard → Workers → bp-proxy → Metrics for req/min, error rate.
