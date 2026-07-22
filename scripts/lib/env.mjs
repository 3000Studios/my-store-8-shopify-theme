import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Candidate paths for the shared workspace env (never commit secrets).
 * First existing readable file wins unless SHOPIFY_ENV_PATH / GLOBAL_ENV_PATH is set.
 */
export function resolveEnvPath(explicitPath) {
  if (explicitPath) return path.resolve(explicitPath);

  const fromEnv =
    process.env.SHOPIFY_ENV_PATH ||
    process.env.GLOBAL_ENV_PATH ||
    process.env.AI_GLOBAL_ENV;
  if (fromEnv) return path.resolve(fromEnv);

  const home = os.homedir();
  const candidates = [
    'C:\\Documents2\\shopify.env',
    'C:\\Documents2\\global.env',
    path.join(home, 'OneDrive', 'Workspaces', 'global.env'),
    path.join(home, '.config', 'env', 'global.env'),
    path.join(home, '.grok', 'global.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', 'global.env'),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  return candidates[0];
}

/**
 * Load KEY=VALUE pairs into process.env without overwriting existing values
 * unless { override: true }.
 */
export function loadEnv(envPath, { override = false } = {}) {
  const resolved = resolveEnvPath(envPath);
  if (!fs.existsSync(resolved)) {
    return { loaded: false, path: resolved, keys: [] };
  }

  const keys = [];
  const text = fs.readFileSync(resolved, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key) continue;
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = value;
    keys.push(key);
  }

  return { loaded: true, path: resolved, keys };
}

export function getShopifyCredentials() {
  const shop =
    process.env.SHOPIFY_SHOP_DOMAIN ||
    process.env.SHOPIFY_SHOP ||
    process.env.SHOPIFY_STORE_DOMAIN ||
    '';
  const token =
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ||
    process.env.SHOPIFY_API_TOKEN ||
    '';
  const themeToken =
    process.env.SHOPIFY_CLI_THEME_TOKEN ||
    process.env.SHOPIFY_THEME_ACCESS_PASSWORD ||
    '';
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
  const themeId =
    process.env.SHOPIFY_THEME_ID ||
    process.env.SHOPIFY_LIVE_THEME_ID ||
    '';

  return {
    shop: shop.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    token,
    themeToken,
    apiVersion,
    themeId,
  };
}

export function requireShopifyAdmin() {
  const creds = getShopifyCredentials();
  if (!creds.shop) {
    throw new Error(
      'Missing SHOPIFY_SHOP_DOMAIN (or SHOPIFY_SHOP). Add it to global.env and recreate the custom app if needed.',
    );
  }
  if (!creds.token) {
    throw new Error(
      'Missing SHOPIFY_ADMIN_ACCESS_TOKEN (Admin API access token from a Shopify custom app). See docs/ai-shopify-bridge.md.',
    );
  }
  return creds;
}

export async function shopifyAdminFetch(pathname, options = {}) {
  const { shop, token, apiVersion } = requireShopifyAdmin();
  const pathPart = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = pathPart.startsWith('/admin/')
    ? `https://${shop}${pathPart}`
    : `https://${shop}/admin/api/${apiVersion}${pathPart}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    const err = new Error(
      `Shopify Admin API ${res.status} ${res.statusText} for ${url}`,
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return { status: res.status, body, headers: res.headers };
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}
