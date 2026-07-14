import fs from 'node:fs';

const DEFAULT_ENV_PATH = 'C:/Users/Servi/.config/env/global.env';
loadEnv(DEFAULT_ENV_PATH);

const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07';

if (!shop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!token) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

const collections = [
  {
    title: 'Deals Under $25',
    handle: 'deals-under-25',
    body_html: '<p>Browse active products priced under $25. Final shipping, taxes, and checkout totals are shown before payment.</p>',
    sort_order: 'best-selling',
    rules: [{ column: 'variant_price', relation: 'less_than', condition: '25.00' }],
  },
  {
    title: 'Gift Ideas',
    handle: 'gift-ideas',
    body_html: '<p>Practical gift ideas from the current live catalog, selected for everyday usefulness and easy browsing.</p>',
    sort_order: 'best-selling',
    rules: [{ column: 'title', relation: 'not_contains', condition: 'Michael Kors' }],
  },
  {
    title: 'New Arrivals',
    handle: 'new-arrivals',
    body_html: '<p>Recently published and refreshed active products from BoughtitOnline.</p>',
    sort_order: 'created-desc',
    rules: [{ column: 'title', relation: 'not_contains', condition: 'Michael Kors' }],
  },
  {
    title: 'Best Sellers',
    handle: 'best-sellers',
    body_html: '<p>Current catalog picks sorted for fast shopping and easy discovery.</p>',
    sort_order: 'best-selling',
    rules: [{ column: 'title', relation: 'not_contains', condition: 'Michael Kors' }],
  },
];

async function main() {
  const existing = await fetchSmartCollections();
  const existingCustom = await fetchCustomCollections();
  const results = [];
  for (const collection of collections) {
    const current = existing.find((item) => item.handle === collection.handle);
    const currentCustom = existingCustom.find((item) => item.handle === collection.handle);
    if (currentCustom && !current) {
      results.push({
        id: currentCustom.id,
        title: currentCustom.title,
        handle: currentCustom.handle,
        skipped: 'custom_collection_handle_exists',
      });
      continue;
    }
    const payload = {
      smart_collection: {
        ...collection,
        published: true,
        disjunctive: false,
      },
    };
    const result = current
      ? await shopifyRest('PUT', `/smart_collections/${current.id}.json`, {
          smart_collection: { ...payload.smart_collection, id: current.id },
        })
      : await shopifyRest('POST', '/smart_collections.json', payload);
    results.push({
      id: result.smart_collection.id,
      title: result.smart_collection.title,
      handle: result.smart_collection.handle,
    });
  }
  console.log(JSON.stringify({ upserted: results.length, collections: results }, null, 2));
}

async function fetchSmartCollections() {
  const collections = [];
  let pageInfo = null;
  do {
    const endpoint = pageInfo
      ? `/smart_collections.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : '/smart_collections.json?limit=250';
    const { json, nextPageInfo } = await shopifyRestWithHeaders('GET', endpoint);
    collections.push(...(json.smart_collections || []));
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return collections;
}

async function fetchCustomCollections() {
  const collections = [];
  let pageInfo = null;
  do {
    const endpoint = pageInfo
      ? `/custom_collections.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : '/custom_collections.json?limit=250';
    const { json, nextPageInfo } = await shopifyRestWithHeaders('GET', endpoint);
    collections.push(...(json.custom_collections || []));
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return collections;
}

async function shopifyRest(method, endpoint, body) {
  return (await shopifyRestWithHeaders(method, endpoint, body)).json;
}

async function shopifyRestWithHeaders(method, endpoint, body) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 500)}`);
  return { json, nextPageInfo: parseNextPageInfo(response.headers.get('link')) };
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const next = linkHeader.split(',').find((part) => /rel="next"/.test(part));
  if (!next) return null;
  const match = next.match(/<([^>]+)>/);
  if (!match) return null;
  return new URL(match[1]).searchParams.get('page_info');
}

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ||= value;
  }
}

main().catch((error) => {
  console.error(`[upsert-smart-collections] fatal: ${error.message}`);
  process.exit(1);
});
