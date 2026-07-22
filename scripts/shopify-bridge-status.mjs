#!/usr/bin/env node
/**
 * Read-only health check for the Grok ↔ Shopify bridge.
 * Never prints secret values.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadEnv,
  getShopifyCredentials,
  shopifyAdminFetch,
  parseArgs,
} from './lib/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
const envInfo = loadEnv(args.env);

// Also merge workspace env after Documents2 shopify.env if both exist
if (envInfo.path && !String(envInfo.path).includes('Workspaces')) {
  loadEnv('C:\\Users\\MrJws\\OneDrive\\Workspaces\\global.env');
}

const storesPath = path.join(repoRoot, 'shopify-stores.json');
const stores = fs.existsSync(storesPath)
  ? JSON.parse(fs.readFileSync(storesPath, 'utf8'))
  : null;

const creds = getShopifyCredentials();
const clientId =
  process.env.SHOPIFY_CLIENT_ID || process.env.SHOPIFY_API_KEY || '';
const clientSecret =
  process.env.SHOPIFY_CLIENT_SECRET || process.env.SHOPIFY_API_SECRET || '';
const automation =
  process.env.SHOPIFY_APP_AUTOMATION_TOKEN || '';

const mask = (v) => (v ? `present (len=${String(v).length})` : 'MISSING');
const looksLikeAtkn = (v) => String(v || '').startsWith('atkn_');
const looksLikeShpat = (v) => String(v || '').startsWith('shpat_');

console.log('=== Shopify AI Bridge Status ===');
console.log(`repo: ${repoRoot}`);
console.log(`env file: ${envInfo.path} (${envInfo.loaded ? 'loaded' : 'NOT FOUND'})`);
console.log(`SHOPIFY_SHOP_DOMAIN: ${creds.shop || 'MISSING'}`);
console.log(`SHOPIFY_ADMIN_ACCESS_TOKEN: ${mask(creds.token)}${looksLikeAtkn(creds.token) ? ' [atkn_ — not an Admin API token]' : ''}${looksLikeShpat(creds.token) ? ' [shpat_ Admin token]' : ''}`);
console.log(`SHOPIFY_CLI_THEME_TOKEN: ${mask(creds.themeToken)}`);
console.log(`SHOPIFY_CLIENT_ID / API_KEY: ${mask(clientId)}`);
console.log(`SHOPIFY_CLIENT_SECRET: ${mask(clientSecret)}`);
console.log(`SHOPIFY_APP_AUTOMATION_TOKEN: ${mask(automation)}`);
console.log(`SHOPIFY_API_VERSION: ${creds.apiVersion}`);
console.log(`SHOPIFY_THEME_ID: ${creds.themeId || '(use package.json / shopify-themes.json)'}`);

if (stores) {
  console.log('\nRegistered stores:');
  for (const s of stores.stores || []) {
    console.log(
      `  - ${s.id}: ${s.domain} liveTheme=${s.liveThemeId} primary=${!!s.primary}`,
    );
  }
}

async function tryClientCredentials() {
  if (!creds.shop || !clientId || !clientSecret) return null;
  const url = `https://${creds.shop}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, text: text.slice(0, 300) };
}

let connected = false;

if (creds.shop && creds.token && !looksLikeAtkn(creds.token)) {
  try {
    const { body } = await shopifyAdminFetch('/shop.json');
    const shop = body?.shop;
    console.log('\nAdmin API: OK');
    console.log(`  shop name: ${shop?.name}`);
    console.log(`  domain: ${shop?.myshopify_domain || shop?.domain}`);
    console.log(`  plan: ${shop?.plan_name}`);
    connected = true;
  } catch (err) {
    console.log('\nAdmin API: FAILED');
    console.log(`  ${err.message}`);
  }
} else if (looksLikeAtkn(creds.token)) {
  console.log('\nAdmin API: skipped — automation token (atkn_) cannot call Admin API.');
}

if (clientId && clientSecret && creds.shop) {
  console.log('\nClient-credentials check (Dev Dashboard app):');
  try {
    const result = await tryClientCredentials();
    if (!result) {
      console.log('  skipped');
    } else if (result.status === 200 && result.json?.access_token) {
      console.log('  OK — app is installed; access token issued.');
      console.log(`  scopes: ${result.json.scope || '(none listed)'}`);
      console.log(
        '  Tip: save result.access_token as SHOPIFY_ADMIN_ACCESS_TOKEN for scripts.',
      );
      connected = true;
    } else {
      const blob = `${result.text || ''} ${JSON.stringify(result.json || {})}`;
      console.log(`  FAILED HTTP ${result.status}`);
      if (/app_not_installed/i.test(blob)) {
        console.log('  Cause: app_not_installed');
        console.log(
          '  Fix: open Shopify Dev Dashboard → this app → install it on knkxfs-xd (BoughtItOnline).',
        );
        console.log(
          '  After install, client_credentials will return an Admin access token.',
        );
      } else {
        console.log(`  body: ${result.text}`);
      }
    }
  } catch (e) {
    console.log(`  error: ${e.message}`);
  }
}

if (connected) {
  console.log('\nRESULT: CONNECTED — Grok can update this shop via Admin API.');
  process.exitCode = 0;
} else {
  console.log('\nRESULT: NOT CONNECTED');
  console.log('What we have from C:\\Documents2\\global.env:');
  console.log('  - Client ID + Secret (Dev Dashboard credentials) ✓');
  console.log('  - App automation token (atkn_) — CLI/CI only, not Admin API');
  console.log('What is still required:');
  console.log('  1) Install the app on store knkxfs-xd.myshopify.com');
  console.log('  2) Then either:');
  console.log('     - re-run client_credentials and store access_token as SHOPIFY_ADMIN_ACCESS_TOKEN');
  console.log('     - OR create a legacy custom app Admin token (shpat_) in store Admin');
  console.log('Guide: docs/ai-shopify-bridge.md');
  process.exitCode = 2;
}
