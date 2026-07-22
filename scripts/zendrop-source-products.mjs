import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { evaluateActivationGate } from './activation-gate.mjs';

import { loadEnv } from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
loadEnv(args.env);

const config = {
  publish: Boolean(args.publish),
  max: Number(args.max || 20),
  searchLimit: Number(args.searchLimit || 60),
  pageLimit: Math.min(Number(args.pageLimit || 20), 60),
  categories: String(args.categories || 'home organization,kitchen gadgets,phone accessories,travel accessories,outdoor accessories')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  priceMax: Number(args.priceMax || 15),
  fallbackShippingCost: Number(args.fallbackShippingCost || Number.NaN),
  fallbackShippingDays: Number(args.fallbackShippingDays || Number.NaN),
  outputPath: path.resolve(args.output || '../../outputs/zendrop-source-products-result.json'),
};

const zendropToken = process.env.ZENDROP_API_TOKEN;
const shopifyShop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const shopifyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const shopifyApiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';

if (!zendropToken) throw new Error('Missing ZENDROP_API_TOKEN in env.');
if (!shopifyShop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!shopifyToken) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

const riskPatterns = [
  /michael\s*kors/i,
  /\b(gucci|prada|louis\s*vuitton|nike|adidas|apple|samsung)\b/i,
  /\b(replica|dupe|counterfeit|branded)\b/i,
  /\b(anti[-\s]?fungal|fungal|cream|medicine|medical|treatment|cure|healing|pain|therapy)\b/i,
  /\b(smart\s*tv\s*box|iptv|screen\s*clicker|auto\s*clicker)\b/i,
  /\b(weapon|knife|gun|tactical|pepper\s*spray|shovel)\b/i,
  /\b(vape|nicotine|cbd|thc)\b/i,
  /\b(baby|children|kids|pet|dog|cat|insect|bee|bug|fireproof|fire\s*proof)\b/i,
];

async function main() {
  const store = await findBoughtitOnlineStore();
  const existingHandles = await fetchShopifyProductHandles();
  const candidates = await discoverCandidates();
  const decisions = [];
  const selected = [];

  for (const product of candidates) {
    if (selected.length >= config.max) break;
    const decision = await evaluateZendropProduct(product, existingHandles);
    decisions.push(decision);
    if (!decision.ok) continue;
    selected.push(decision);
  }

  const result = {
    at: new Date().toISOString(),
    mode: config.publish ? 'publish' : 'dry-run',
    store,
    discovered: candidates.length,
    evaluated: decisions.length,
    eligible: decisions.filter((decision) => decision.ok).length,
    selected: selected.length,
    selectedProducts: selected,
    skipped: decisions.filter((decision) => !decision.ok).slice(0, 80),
    imported: [],
    config: { ...config, outputPath: undefined },
  };

  if (config.publish) {
    for (const decision of selected) {
      result.imported.push(await importPassingProduct(store.id, decision));
      await sleep(1200);
    }
  }

  fs.mkdirSync(path.dirname(config.outputPath), { recursive: true });
  fs.writeFileSync(config.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    store: store.name,
    discovered: result.discovered,
    evaluated: result.evaluated,
    eligible: result.eligible,
    selected: result.selected,
    imported: result.imported.length,
    outputPath: config.outputPath,
  }, null, 2));
}

async function findBoughtitOnlineStore() {
  const stores = await callZendropTool('get_stores', { limit: 50 });
  const list = stores?.stores || [];
  const store = list.find((item) => /knkxfs-xd\.myshopify\.com/i.test(item.url || ''))
    || list.find((item) => /boughtitonline/i.test(`${item.name} ${item.url}`));
  if (!store) throw new Error('BoughtitOnline Zendrop store connection was not found.');
  return store;
}

async function discoverCandidates() {
  const byId = new Map();
  const trending = await callZendropTool('get_catalog_trending_products', {
    page: 1,
    limit: config.pageLimit,
  });
  for (const product of trending?.products || []) byId.set(String(product.id), product);

  for (const category of config.categories) {
    const result = await callZendropTool('get_catalog_products', {
      keyword: category,
      price_max: config.priceMax,
      page: 1,
      limit: config.pageLimit,
    });
    for (const product of result?.products || []) byId.set(String(product.id), product);
  }

  return [...byId.values()].slice(0, config.searchLimit);
}

async function evaluateZendropProduct(product, existingHandles) {
  const title = String(product.name || product.title || '').trim();
  const handle = slugify(title);
  const productCost = Number(product.price);
  const text = `${title} ${stripHtml(product.description || '')}`;
  const images = normalizeImages(product);
  const reasons = [];

  if (!title) reasons.push('missing_title');
  if (existingHandles.has(handle)) reasons.push('already_in_shopify');
  if (!Number.isFinite(productCost) || productCost <= 0) reasons.push('missing_product_cost');
  if (riskPatterns.some((pattern) => pattern.test(text))) reasons.push('risk_pattern');
  if (images.length < 2) reasons.push('needs_at_least_two_real_images');
  if (images.some((url) => !isAllowedImageUrl(url))) reasons.push('invalid_image_url');

  const shipping = await getBestShipping(product.id);
  if (!shipping) reasons.push('missing_shipping_estimate');
  const supplierShipping = shipping?.cost;
  const shippingDays = shipping?.days;
  const price = Number.isFinite(productCost) && Number.isFinite(supplierShipping)
    ? choosePrice(productCost, supplierShipping)
    : null;
  const gate = price
    ? evaluateActivationGate({
        price,
        productCost,
        supplierShipping,
        shippingTimeDays: shippingDays,
        supplierVerified: true,
        inventoryAvailable: true,
        hasRealImages: images.length >= 2,
        notHighRisk: !riskPatterns.some((pattern) => pattern.test(text)),
      })
    : null;

  if (!price) reasons.push('no_profitable_price');
  if (gate && !gate.passed) reasons.push(...gate.failures);

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    zendropProductId: product.id,
    title,
    handle,
    productCost,
    supplierShipping,
    shippingDays,
    price,
    imageCount: images.length,
    images,
    category: categoryFor(title),
    gate: gate && {
      netProfit: Number(gate.netProfit.toFixed(2)),
      netMargin: Number(gate.netMargin.toFixed(4)),
      minimumPrice: Number(gate.minimumPrice.toFixed(2)),
    },
  };
}

async function getBestShipping(productId) {
  const result = await callZendropTool('get_catalog_shipping_estimate', {
    product_id: Number(productId),
    country_code: 'US',
  });
  const options = result?.shipping_estimates || result?.shipping_options || result?.options || [];
  const normalized = options
    .map((option) => ({
      cost: Number(option.cost ?? option.price ?? option.amount),
      days: parseShippingDays(option.estimated_days ?? option.days ?? option.delivery_days ?? option.max_days ?? option.estimated_delivery),
      raw: option,
    }))
    .filter((option) => Number.isFinite(option.cost) && Number.isFinite(option.days));
  if (normalized.length > 0) {
    return normalized.sort((a, b) => a.days - b.days || a.cost - b.cost)[0];
  }
  if (Number.isFinite(config.fallbackShippingCost) && Number.isFinite(config.fallbackShippingDays)) {
    return { cost: config.fallbackShippingCost, days: config.fallbackShippingDays, fallback: true };
  }
  return null;
}

async function importPassingProduct(storeId, decision) {
  const added = await callZendropTool('add_my_product', {
    store_id: Number(storeId),
    product_id: Number(decision.zendropProductId),
  });
  const importListId = added?.import_list_id || added?.id || added?.product?.import_list_id
    || await findImportListId(storeId, decision.zendropProductId);
  if (!importListId) return { ...decision, imported: false, reason: 'missing_import_list_id_after_add', addResult: added };

  const imported = await callZendropTool('import_my_product', {
    import_list_id: Number(importListId),
  });
  return {
    zendropProductId: decision.zendropProductId,
    title: decision.title,
    importListId,
    importOperation: imported,
    imported: true,
  };
}

async function findImportListId(storeId, productId) {
  for (const status of ['imported', 'in_store']) {
    for (let page = 1; page <= 5; page += 1) {
      const list = await callZendropTool('get_my_products', {
        store_id: Number(storeId),
        status,
        page,
        limit: 60,
      });
      const match = (list?.items || []).find((item) => Number(item.product_id) === Number(productId));
      if (match?.import_list_id) return match.import_list_id;
      if (!list?.items?.length || list.items.length < 60) break;
    }
  }
  return null;
}

async function callZendropTool(name, toolArgs) {
  const response = await fetch('https://app.zendrop.com/mcp/v1', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${zendropToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now() + Math.floor(Math.random() * 1000),
      method: 'tools/call',
      params: { name, arguments: toolArgs },
    }),
  });
  const json = await response.json();
  if (!response.ok || json.error) throw new Error(`Zendrop ${name} failed: ${JSON.stringify(json.error || json).slice(0, 500)}`);
  if (json.result?.isError) throw new Error(`Zendrop ${name} returned error: ${JSON.stringify(json.result).slice(0, 500)}`);
  return json.result?.structuredContent || parseToolText(json.result);
}

function parseToolText(result) {
  const text = result?.content?.find((item) => item.type === 'text')?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

async function fetchShopifyProductHandles() {
  const handles = new Set();
  let pageInfo = null;
  do {
    const endpoint = pageInfo
      ? `/products.json?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : '/products.json?limit=250';
    const { json, nextPageInfo } = await shopifyRest('GET', endpoint);
    for (const product of json.products || []) handles.add(product.handle);
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return handles;
}

async function shopifyRest(method, endpoint, body) {
  const response = await fetch(`https://${shopifyShop}/admin/api/${shopifyApiVersion}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': shopifyToken,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 500)}`);
  return { json, nextPageInfo: parseNextPageInfo(response.headers.get('link')) };
}

function choosePrice(productCost, shippingCost) {
  const ladder = [12.99, 14.99, 16.99, 19.99, 22.99, 24.99, 29.99, 34.99, 39.99, 44.99, 49.99, 59.99, 69.99];
  return ladder.find((price) => evaluateActivationGate({
    price,
    productCost,
    supplierShipping: shippingCost,
    shippingTimeDays: 12,
    supplierVerified: true,
    inventoryAvailable: true,
    hasRealImages: true,
    notHighRisk: true,
  }).passed) || null;
}

function normalizeImages(product) {
  const images = Array.isArray(product.images)
    ? product.images.map((image) => image.url || image.src || image)
    : [];
  if (product.image) images.unshift(product.image);
  return [...new Set(images.filter(Boolean).map(String))];
}

function isAllowedImageUrl(src) {
  try {
    const url = new URL(String(src));
    return ['http:', 'https:'].includes(url.protocol)
      && !/\b(example\.com|placeholder|dummy|lorem|placehold\.co|picsum\.photos)\b/i.test(url.href);
  } catch {
    return false;
  }
}

function categoryFor(title) {
  const text = String(title).toLowerCase();
  if (/phone|cable|charger|tablet|laptop|usb|desk/.test(text)) return 'tech-accessories';
  if (/camp|outdoor|garden|travel|hiking|sports/.test(text)) return 'outdoor-sports';
  if (/kitchen|organizer|storage|home|bath|clean/.test(text)) return 'home-living';
  return 'best-picks';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ');
}

function parseShippingDays(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value || '').match(/\d+/);
  return match ? Number(match[0]) : Number.NaN;
}

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const next = linkHeader.split(',').find((part) => /rel="next"/.test(part));
  if (!next) return null;
  const match = next.match(/<([^>]+)>/);
  if (!match) return null;
  return new URL(match[1]).searchParams.get('page_info');
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'publish') {
      parsed[key] = true;
    } else {
      parsed[key] = rawArgs[i + 1];
      i += 1;
    }
  }
  return parsed;
}

main().catch((error) => {
  console.error(`[zendrop-source-products] fatal: ${error.message}`);
  process.exit(1);
});
