import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_ENV_PATH = 'C:/Users/Servi/.config/env/global.env';
const DEFAULT_QUEUE_PATH = path.resolve('data/auto-product-queue.json');
const DEFAULT_LOG_PATH = path.resolve('logs/auto-product-publisher.jsonl');

const args = parseArgs(process.argv.slice(2));
loadEnv(args.env || DEFAULT_ENV_PATH);

const config = {
  queuePath: path.resolve(args.source || DEFAULT_QUEUE_PATH),
  logPath: path.resolve(args.log || DEFAULT_LOG_PATH),
  publish: Boolean(args.publish),
  once: Boolean(args.once),
  intervalMs: Number(args.intervalMs || args.interval || 15 * 60 * 1000),
  maxPerRun: Number(args.maxPerRun || 10),
  minNetMargin: Number(args.minNetMargin || 0.25),
  minNetProfit: Number(args.minNetProfit || 5),
  maxShippingDays: Number(args.maxShippingDays || 12),
};

const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-07';

if (!shop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!token) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

const riskPatterns = [
  /michael\s*kors/i,
  /\b(gucci|prada|louis\s*vuitton|nike|adidas|apple|samsung)\b/i,
  /\b(replica|dupe|counterfeit|branded)\b/i,
  /\b(anti[-\s]?fungal|fungal|cream|medicine|medical|treatment|cure|healing)\b/i,
  /\b(smart\s*tv\s*box|iptv|screen\s*clicker|auto\s*clicker)\b/i,
  /\b(weapon|knife|gun|tactical|pepper\s*spray)\b/i,
  /\b(vape|nicotine|cbd|thc)\b/i,
];

async function main() {
  printStartup();

  do {
    const summary = await runOnce();
    console.log(`[auto-product-publisher] run complete: ${JSON.stringify(summary)}`);
    if (config.once) break;
    await sleep(config.intervalMs);
  } while (true);
}

async function runOnce() {
  const queue = readQueue(config.queuePath);
  const pending = queue.products.filter((product) => product.status !== 'published' && product.status !== 'rejected');
  const selected = pending.slice(0, config.maxPerRun);
  const summary = { checked: 0, created: 0, updated: 0, published: 0, rejected: 0, dryRun: !config.publish };

  for (const item of selected) {
    summary.checked += 1;
    const decision = evaluateProduct(item, config);
    if (!decision.ok) {
      item.status = 'rejected';
      item.rejectedAt = new Date().toISOString();
      item.rejectionReasons = decision.reasons;
      summary.rejected += 1;
      writeLog('reject', item, decision);
      continue;
    }

    item.calculatedPrice = decision.price.toFixed(2);
    item.estimatedProfit = decision.profit.toFixed(2);
    item.estimatedNetMargin = decision.netMargin.toFixed(4);
    item.lastVerifiedAt = new Date().toISOString();

    if (!config.publish) {
      item.status = 'ready';
      writeLog('ready-dry-run', item, decision);
      continue;
    }

    const result = item.shopifyProductId
      ? await updateExistingProduct(item, decision)
      : await createProduct(item, decision);

    item.shopifyProductId = result.id;
    item.shopifyHandle = result.handle;
    item.status = 'published';
    item.publishedAt = new Date().toISOString();
    item.lastPublishResult = result;

    if (result.created) summary.created += 1;
    if (result.updated) summary.updated += 1;
    summary.published += 1;
    writeLog('published', item, decision);
  }

  writeQueue(config.queuePath, queue);
  return summary;
}

function evaluateProduct(item, cfg) {
  const reasons = [];
  const title = String(item.title || '').trim();
  const textForRisk = `${title} ${item.description || ''} ${(item.tags || []).join(' ')}`;

  if (!title) reasons.push('missing_title');
  if (riskPatterns.some((pattern) => pattern.test(textForRisk))) reasons.push('risk_category_or_brand');
  if (!item.supplierName && !item.supplierProductId) reasons.push('missing_verified_supplier');
  if (!item.inventoryAvailable) reasons.push('inventory_not_verified');
  if (item.hasRealImages !== true) reasons.push('real_images_not_verified');
  if (!Array.isArray(item.images) || item.images.length === 0) reasons.push('missing_real_images');
  if (Array.isArray(item.images) && item.images.some((src) => !isAllowedImageUrl(src))) reasons.push('invalid_or_placeholder_image_url');
  if (!Number.isFinite(Number(item.productCost)) || Number(item.productCost) <= 0) reasons.push('missing_product_cost');
  if (!Number.isFinite(Number(item.supplierShipping)) || Number(item.supplierShipping) < 0) reasons.push('missing_supplier_shipping');
  if (!Number.isFinite(Number(item.shippingDays)) || Number(item.shippingDays) > cfg.maxShippingDays) reasons.push('shipping_too_slow_or_missing');

  const landedCost = Number(item.productCost || 0) + Number(item.supplierShipping || 0);
  const price = choosePrice(landedCost, item.preferredPrice);
  const cost = calculateCostModel(price, landedCost);
  const profit = price - cost.totalCost;
  const netMargin = profit / price;

  if (profit < cfg.minNetProfit) reasons.push(`net_profit_below_${cfg.minNetProfit}`);
  if (netMargin < cfg.minNetMargin) reasons.push(`net_margin_below_${cfg.minNetMargin}`);

  return {
    ok: reasons.length === 0,
    reasons,
    landedCost,
    price,
    ...cost,
    profit,
    netMargin,
  };
}

function choosePrice(landedCost, preferredPrice) {
  const candidate = Number(preferredPrice);
  const floor = pricingFloorForLandedCost(landedCost);
  if (Number.isFinite(candidate) && candidate >= floor) return roundPrice(candidate);
  return roundPrice(floor);
}

function pricingFloorForLandedCost(landedCost) {
  if (landedCost <= 1) return 9.99;
  if (landedCost <= 3) return 12.99;
  if (landedCost <= 5) return 16.99;
  if (landedCost <= 8) return 22.99;
  if (landedCost <= 12) return 34.99;
  if (landedCost <= 20) return 49.99;
  return Math.ceil(landedCost * 2.8) - 0.01;
}

function roundPrice(value) {
  const ladder = [6.99, 7.99, 8.99, 9.99, 12.99, 14.99, 16.99, 19.99, 22.99, 24.99, 29.99, 34.99, 39.99, 49.99, 59.99, 69.99, 79.99, 99.99];
  const match = ladder.find((price) => price >= value);
  if (match) return match;
  return Math.ceil(value / 5) * 5 - 0.01;
}

function calculateCostModel(price, landedCost) {
  const paymentFee = price * 0.03 + 0.3;
  const platformBuffer = price * 0.03;
  const refundReturnBuffer = price * 0.08;
  const discountBuffer = price * 0.05;
  const adTestingBuffer = price * 0.1;
  const totalCost = landedCost + paymentFee + platformBuffer + refundReturnBuffer + discountBuffer + adTestingBuffer;
  return { paymentFee, platformBuffer, refundReturnBuffer, discountBuffer, adTestingBuffer, totalCost };
}

async function createProduct(item, decision) {
  const payload = { product: buildShopifyProduct(item, decision, 'active') };
  const response = await shopifyRest('POST', '/products.json', payload);
  await setInventoryCosts(response.product.variants, item, decision);
  return { id: response.product.id, handle: response.product.handle, created: true };
}

async function updateExistingProduct(item, decision) {
  const id = numericShopifyId(item.shopifyProductId);
  const payload = { product: { ...buildShopifyProduct(item, decision, 'active'), id } };
  const response = await shopifyRest('PUT', `/products/${id}.json`, payload);
  await setInventoryCosts(response.product.variants, item, decision);
  return { id: response.product.id, handle: response.product.handle, updated: true };
}

function buildShopifyProduct(item, decision, status) {
  const variants = normalizeVariants(item, decision);
  const tags = new Set([
    'auto-published',
    'supplier-verified',
    'profit-verified',
    'inventory-verified',
    ...(item.tags || []),
  ]);

  return {
    title: item.title,
    handle: item.handle,
    status,
    published: true,
    published_scope: 'web',
    vendor: item.publicVendor || 'BoughtitOnline',
    product_type: item.productType || 'General',
    tags: [...tags].filter(Boolean).join(', '),
    body_html: buildDescription(item, decision),
    options: variants.length > 1 ? [{ name: item.variantOptionName || 'Option', values: variants.map((variant) => variant.option1) }] : undefined,
    variants,
    images: item.images.map((src) => ({ src })),
    metafields: [
      { namespace: 'sourcing', key: 'supplier_product_id', type: 'single_line_text_field', value: String(item.supplierProductId || '') },
      { namespace: 'sourcing', key: 'landed_cost', type: 'single_line_text_field', value: decision.landedCost.toFixed(2) },
      { namespace: 'sourcing', key: 'net_profit', type: 'single_line_text_field', value: decision.profit.toFixed(2) },
      { namespace: 'sourcing', key: 'net_margin', type: 'single_line_text_field', value: decision.netMargin.toFixed(4) },
      { namespace: 'sourcing', key: 'shipping_days', type: 'single_line_text_field', value: String(item.shippingDays) },
    ],
  };
}

function normalizeVariants(item, decision) {
  const sourceVariants = Array.isArray(item.variants) && item.variants.length > 0
    ? item.variants
    : [{ title: 'Default Title', sku: item.sku || skuFromTitle(item.title) }];

  return sourceVariants.map((variant, index) => ({
    option1: variant.title === 'Default Title' ? undefined : variant.title,
    price: decision.price.toFixed(2),
    sku: variant.sku || `${skuFromTitle(item.title)}-${index + 1}`,
    inventory_policy: 'deny',
    requires_shipping: true,
    taxable: true,
  }));
}

function buildDescription(item, decision) {
  const cleanDescription = String(item.description || '').trim();
  const shippingLine = `Estimated delivery timing is shown at checkout and may vary by destination.`;
  const qualityLine = `Published after cost, inventory, media, shipping, and product-risk checks.`;
  return `<p>${escapeHtml(cleanDescription || item.title)}</p><ul><li>${escapeHtml(shippingLine)}</li><li>${escapeHtml(qualityLine)}</li></ul>`;
}

function isAllowedImageUrl(src) {
  try {
    const url = new URL(String(src));
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    return !/\b(example\.com|placeholder|dummy|lorem|placehold\.co|picsum\.photos)\b/i.test(url.href);
  } catch {
    return false;
  }
}

async function setInventoryCosts(variants, item, decision) {
  for (const variant of variants || []) {
    if (!variant.inventory_item_id) continue;
    await shopifyRest('PUT', `/inventory_items/${variant.inventory_item_id}.json`, {
      inventory_item: {
        id: variant.inventory_item_id,
        cost: decision.landedCost.toFixed(2),
        tracked: false,
      },
    });
  }
}

async function shopifyRest(method, endpoint, body) {
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
  return json;
}

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) {
    return { products: [] };
  }
  const parsed = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
  if (!Array.isArray(parsed.products)) throw new Error(`Queue file must contain { "products": [] }: ${queuePath}`);
  return parsed;
}

function writeQueue(queuePath, queue) {
  fs.mkdirSync(path.dirname(queuePath), { recursive: true });
  fs.writeFileSync(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
}

function writeLog(event, item, decision) {
  fs.mkdirSync(path.dirname(config.logPath), { recursive: true });
  fs.appendFileSync(config.logPath, `${JSON.stringify({ event, at: new Date().toISOString(), title: item.title, shopifyProductId: item.shopifyProductId, decision })}\n`);
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

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (['publish', 'once'].includes(key)) {
      parsed[key] = true;
    } else {
      parsed[key] = rawArgs[i + 1];
      i += 1;
    }
  }
  return parsed;
}

function numericShopifyId(id) {
  return String(id).split('/').pop();
}

function skuFromTitle(title) {
  return String(title || 'PRODUCT')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 42);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function printStartup() {
  console.log(`[auto-product-publisher] shop=${shop}`);
  console.log(`[auto-product-publisher] source=${config.queuePath}`);
  console.log(`[auto-product-publisher] mode=${config.publish ? 'PUBLISH' : 'DRY_RUN'}`);
  console.log(`[auto-product-publisher] intervalMs=${config.intervalMs} maxPerRun=${config.maxPerRun}`);
}

main().catch((error) => {
  console.error(`[auto-product-publisher] fatal: ${error.message}`);
  process.exit(1);
});
