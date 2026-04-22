// Blueprint Map proxy — reads Google Sheets via a service account on behalf
// of authenticated @coreweave.com users. Stands in for the retired Apps Script
// JSONP path, which couldn't work cross-origin in third-party-cookie-restricted
// browser contexts (Chrome Incognito, Safari ITP).
//
// GET /sheet?id=<sheetId>&tab=<tabName>
//   Authorization: Bearer <google_id_token>
//
// OPTIONS /sheet — CORS preflight.
//
// Responses:
//   200 { meta: { rows, cols, fetchedAt }, cells: string[][] }
//   401 { error: "AUTH", reason?: string }
//   400 { error: "BAD_REQUEST", reason: string }
//   404 { error: "SHEET_NOT_FOUND_OR_NOT_SHARED" }
//   500 { error: "INTERNAL" }

import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from 'jose';

export interface Env {
  GOOGLE_SA_KEY: string;            // secret: full service-account JSON
  GOOGLE_OAUTH_CLIENT_ID: string;   // secret: GIS client ID
  ALLOWED_ORIGIN: string;           // var: "https://rpatino-cw.github.io"
  ALLOWED_HD: string;               // var: "coreweave.com"
}

// ────────────────────────────────────────────────────────────────────────────
// CORS

function corsHeaders(env: Env): HeadersInit {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, env: Env, extra?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env), ...(extra || {}) },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// ID token verification (user)

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

interface VerifiedUser {
  email: string;
  hd: string;
  sub: string;
}

async function verifyIdToken(token: string, env: Env): Promise<VerifiedUser> {
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
  });
  const hd = typeof payload.hd === 'string' ? payload.hd : '';
  const email = typeof payload.email === 'string' ? payload.email : '';
  const sub = typeof payload.sub === 'string' ? payload.sub : '';
  if (hd !== env.ALLOWED_HD) {
    throw new Error(`hd claim is "${hd}", expected "${env.ALLOWED_HD}"`);
  }
  if (!email) {
    throw new Error('id token missing email claim');
  }
  return { email, hd, sub };
}

// ────────────────────────────────────────────────────────────────────────────
// Service-account access token for Sheets API
// Cached in Workers cache.default keyed by a stable URL; lives ~50min.

interface SAKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SA_TOKEN_CACHE_KEY = 'https://cache.bp-proxy/sa-token-v1';

async function getServiceAccountAccessToken(env: Env, ctx: ExecutionContext): Promise<string> {
  const cache = caches.default;
  const cached = await cache.match(SA_TOKEN_CACHE_KEY);
  if (cached) {
    const body = (await cached.json()) as { access_token: string; exp: number };
    if (body.exp > Math.floor(Date.now() / 1000) + 60) return body.access_token;
  }

  const sa = JSON.parse(env.GOOGLE_SA_KEY) as SAKey;
  const pk = await importPKCS8(sa.private_key, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience(sa.token_uri || 'https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(pk);

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
  const resp = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`SA token exchange failed: ${resp.status} ${txt}`);
  }
  const out = (await resp.json()) as { access_token: string; expires_in: number };
  const expSecs = now + Math.min(out.expires_in ?? 3600, 3500);

  // Cache the token. Cache TTL comes from the Cache-Control header we attach.
  const cacheEntry = new Response(
    JSON.stringify({ access_token: out.access_token, exp: expSecs }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${expSecs - now}` } }
  );
  ctx.waitUntil(cache.put(SA_TOKEN_CACHE_KEY, cacheEntry));

  return out.access_token;
}

// ────────────────────────────────────────────────────────────────────────────
// Sheets API fetch

interface SheetValuesResp {
  range?: string;
  majorDimension?: string;
  values?: unknown[][];
}

async function fetchSheetValues(
  sheetId: string,
  tab: string,
  accessToken: string
): Promise<string[][]> {
  // Quote-wrap tab names that contain spaces or special chars — Sheets A1 notation.
  const range = /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}` +
    `?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (resp.status === 403 || resp.status === 404) {
    throw new HTTPError(404, 'SHEET_NOT_FOUND_OR_NOT_SHARED', `${resp.status} from Sheets API`);
  }
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Sheets API failed: ${resp.status} ${txt}`);
  }
  const data = (await resp.json()) as SheetValuesResp;
  const raw = data.values || [];
  // Normalize every cell to string, matching old Apps Script output shape.
  return raw.map((row) => row.map((cell) => (cell == null ? '' : String(cell))));
}

class HTTPError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Request handler

async function handleSheet(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const sheetId = url.searchParams.get('id');
  const tab = url.searchParams.get('tab') || 'OVERHEAD';
  if (!sheetId) return json({ error: 'BAD_REQUEST', reason: 'missing id' }, 400, env);

  // Auth: require Bearer ID token.
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return json({ error: 'AUTH', reason: 'missing Authorization header' }, 401, env);

  let user: VerifiedUser;
  try {
    user = await verifyIdToken(m[1], env);
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : 'verify failed';
    return json({ error: 'AUTH', reason }, 401, env);
  }

  // Fetch.
  try {
    const accessToken = await getServiceAccountAccessToken(env, ctx);
    const cells = await fetchSheetValues(sheetId, tab, accessToken);
    return json(
      {
        meta: {
          rows: cells.length,
          cols: cells.length ? Math.max(...cells.map((r) => r.length)) : 0,
          fetchedAt: new Date().toISOString(),
          user: user.email,
        },
        cells,
      },
      200,
      env
    );
  } catch (e: unknown) {
    if (e instanceof HTTPError) {
      return json({ error: e.code, reason: e.message }, e.status, env);
    }
    const reason = e instanceof Error ? e.message : 'unknown';
    console.error('[bp-proxy] internal error:', reason);
    return json({ error: 'INTERNAL', reason }, 500, env);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    if (url.pathname === '/sheet' && request.method === 'GET') {
      return handleSheet(request, env, ctx);
    }

    if (url.pathname === '/' || url.pathname === '/healthz') {
      return json({ ok: true, service: 'bp-proxy', commit: 'dev' }, 200, env);
    }

    return json({ error: 'NOT_FOUND' }, 404, env);
  },
};
