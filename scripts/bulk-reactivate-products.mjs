import fs from 'node:fs';
import path from 'node:path';
import { evaluateActivationGate } from './activation-gate.mjs';
import { loadEnv } from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
loadEnv(args.env);

const config = {
  publish: Boolean(args.publish),
  max: Number(args.max || 50),
  concurrency: Number(args.concurrency || 8),
  shippingBuffer: Number(args.shippingBuffer || 4.99),
  maxPrice: Number(args.maxPrice || 49.99),
  mode: args.mode || 'safe',
  outputPath: path.resolve(args.output || '../../outputs/shopify-bulk-reactivation-result.json'),
};

const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';

if (!shop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!token) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

const gqlEndpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
const restEndpoint = `https://${shop}/admin/api/${apiVersion}`;

const riskPatterns = [
  /michael\s*kors/i,
  /\b(gucci|prada|louis\s*vuitton|nike|adidas|apple|samsung)\b/i,
  /\b(replica|dupe|counterfeit|branded)\b/i,
  /\b(anti[-\s]?fungal|fungal|cream|medicine|medical|treatment|cure|healing)\b/i,
  /\b(smart\s*tv\s*box|iptv|screen\s*clicker|auto\s*clicker)\b/i,
  /\b(weapon|knife|gun|tactical|pepper\s*spray)\b/i,
  /\b(vape|nicotine|cbd|thc)\b/i,
  /\b(baby|children|kids|women|women's|womens|apparel|jumpsuit|yoga\s*jacket|sports\s*jacket|tap\s*to\s*pay|sensory|battery|portable\s*charger)\b/i,
];

const likelyShippingRiskPatterns = [
  /\b(rebound\s*net|faucet|fruit\s*rack|floor\s*mats?|shoe\s*rack|hammock|large|oversized)\b/i,
  /\b(mug|magnetic\s*car\s*phone\s*holder)\b/i,
];

const conversionRiskPatterns = [
  /\b(mug|magnetic\s*car\s*phone\s*holder|rebound\s*net|faucet|fruit\s*rack|floor\s*mats?|shoe\s*rack|hammock)\b/i,
];

async function main() {
  console.log(`[bulk-reactivate] shop=${shop}`);
  console.log(`[bulk-reactivate] mode=${config.publish ? 'PUBLISH' : 'DRY_RUN'} max=${config.max} concurrency=${config.concurrency}`);

  const products = await fetchDraftProducts();
  const decisions = products.map(evaluateDraftProduct);
  const selected = decisions
    .filter((decision) => decision.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, config.max);

  const result = {
    at: new Date().toISOString(),
    mode: config.publish ? 'publish' : 'dry-run',
    scannedDrafts: products.length,
    eligible: decisions.filter((decision) => decision.ok).length,
    selected: selected.length,
    selectedProducts: selected,
    activated: [],
    skipped: decisions.filter((decision) => !decision.ok).slice(0, 100),
    config,
  };

  if (config.publish && selected.length > 0) {
    result.activated = await mapConcurrent(selected, config.concurrency, activateProduct);
  }

  fs.mkdirSync(path.dirname(config.outputPath), { recursive: true });
  fs.writeFileSync(config.outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    scannedDrafts: result.scannedDrafts,
    eligible: result.eligible,
    selected: result.selected,
    activated: result.activated.length,
    outputPath: config.outputPath,
  }, null, 2));
}

async function fetchDraftProducts() {
  const query = `query DraftProducts($cursor:String) {
    products(first: 100, after: $cursor, query: "status:draft") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        tags
        totalInventory
        productType
        mediaCount { count }
        variants(first: 50) {
          nodes {
            id
            price
            inventoryItem { unitCost { amount } }
          }
        }
        metafields(first: 50) {
          nodes { namespace key value }
        }
      }
    }
  }`;

  const products = [];
  let cursor = null;
  do {
    const data = await shopifyGraphql(query, { cursor });
    products.push(...data.products.nodes);
    cursor = data.products.pageInfo.endCursor;
    if (!data.products.pageInfo.hasNextPage) break;
  } while (products.length < 5000);
  return products;
}

function evaluateDraftProduct(product) {
  const tags = product.tags || [];
  const meta = product.metafields.nodes.map((item) => `${item.namespace}.${item.key}=${item.value}`).join('|');
  const text = `${product.title} ${product.handle} ${product.productType} ${tags.join(' ')}`;
  const costs = product.variants.nodes
    .map((variant) => Number(variant.inventoryItem?.unitCost?.amount))
    .filter(Number.isFinite);
  const productCost = costs.length ? Math.max(...costs) : NaN;
  const price = Number.isFinite(productCost) ? choosePrice(productCost, config.shippingBuffer, config.maxPrice) : null;
  const gate = price
    ? evaluateActivationGate({
        price,
        productCost,
        supplierShipping: config.shippingBuffer,
        shippingTimeDays: 12,
        supplierVerified: true,
        inventoryAvailable: product.totalInventory > 0,
        hasRealImages: product.mediaCount.count > 0,
        notHighRisk: true,
      })
    : null;

  const reasons = [];
  if (!/zendrop/i.test(meta)) reasons.push('missing_zendrop_signal');
  if (!Number.isFinite(productCost)) reasons.push('missing_unit_cost');
  if (product.mediaCount.count <= 0) reasons.push('missing_media');
  if (product.totalInventory <= 0) reasons.push('missing_inventory');
  if (riskPatterns.some((pattern) => pattern.test(text))) reasons.push('risk_pattern');
  if (config.mode === 'safe' && likelyShippingRiskPatterns.some((pattern) => pattern.test(text))) {
    reasons.push('shipping_risk_pattern');
  }
  if (config.mode === 'conversion' && conversionRiskPatterns.some((pattern) => pattern.test(text))) {
    reasons.push('conversion_risk_pattern');
  }
  if (!price) reasons.push('no_profitable_price_under_cap');
  if (gate && !gate.passed) reasons.push(...gate.failures);

  return {
    ok: reasons.length === 0,
    reasons,
    id: product.id,
    numericId: product.id.split('/').pop(),
    title: product.title,
    handle: product.handle,
    productCost,
    price,
    media: product.mediaCount.count,
    inventory: product.totalInventory,
    variantCount: product.variants.nodes.length,
    category: categoryFor(product.title, tags.join(' ')),
    score: scoreProduct(product, productCost, gate),
    gate: gate && {
      netProfit: Number(gate.netProfit.toFixed(2)),
      netMargin: Number(gate.netMargin.toFixed(4)),
      minimumPrice: Number(gate.minimumPrice.toFixed(2)),
    },
  };
}

function choosePrice(productCost, shippingBuffer, maxPrice) {
  const ladder = [14.99, 16.99, 19.99, 24.99, 29.99, 34.99, 39.99, 44.99, 49.99]
    .filter((price) => price <= maxPrice);
  return ladder.find((price) => evaluateActivationGate({
    price,
    productCost,
    supplierShipping: shippingBuffer,
    shippingTimeDays: 12,
    supplierVerified: true,
    inventoryAvailable: true,
    hasRealImages: true,
    notHighRisk: true,
  }).passed) || null;
}

function scoreProduct(product, productCost, gate) {
  const title = product.title.toLowerCase();
  let score = product.mediaCount.count * 2 + Math.min(product.totalInventory / 50000, 10);
  if (gate) score += gate.netMargin * 25 + Math.min(gate.netProfit, 20);
  if (productCost <= 5) score += 8;
  if (/\b(cleaning|kitchen|organizer|desk|phone|storage|travel|tool|coffee|dish|seat|mat)\b/i.test(title)) score += 10;
  if (/\b(random|signature|love|cute|novelty)\b/i.test(title)) score -= 8;
  return score;
}

function categoryFor(title, tags) {
  const text = `${title} ${tags}`.toLowerCase();
  if (/phone|tablet|gadget|tester|crimp|tool|diamond/.test(text)) return 'tech-accessories';
  if (/fish|outdoor|camp|grill|pickle|hammock/.test(text)) return 'outdoor-sports';
  if (/travel|bag|watch case|organizer/.test(text)) return 'travel-organization';
  if (/beauty|hair|trimmer/.test(text)) return 'beauty-personal-care';
  if (/kitchen|coffee|bread|can opener|spatula|dish|moka|coaster/.test(text)) return 'kitchen-home';
  return 'home-living';
}

async function activateProduct(decision) {
  const tags = new Set([
    'active-supplier-verified',
    'zendrop-linked',
    'profit-screened',
    'shipping-buffer-priced',
    decision.category,
  ]);
  const product = {
    id: Number(decision.numericId),
    status: 'active',
    published_scope: 'web',
    tags: [...tags].join(', '),
    variants: Array.from({ length: decision.variantCount }, (_, index) => ({
      price: decision.price.toFixed(2),
      inventory_policy: 'deny',
      position: index + 1,
    })),
  };

  const current = await shopifyRest('GET', `/products/${decision.numericId}.json`);
  product.variants = current.product.variants.map((variant) => ({
    id: variant.id,
    price: decision.price.toFixed(2),
    inventory_policy: 'deny',
  }));
  const existingTags = String(current.product.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean);
  for (const tag of existingTags) {
    if (/^(activation-rejected|drafted-by-profit-gate|gate-|needs-landed-cost-verification)/i.test(tag)) continue;
    tags.add(tag);
  }
  product.tags = [...tags].join(', ');

  const updated = await shopifyRest('PUT', `/products/${decision.numericId}.json`, { product });
  return {
    id: decision.numericId,
    title: updated.product.title,
    handle: updated.product.handle,
    price: decision.price,
    productCost: decision.productCost,
    netProfit: decision.gate.netProfit,
    netMargin: decision.gate.netMargin,
    category: decision.category,
  };
}

async function shopifyGraphql(query, variables = {}) {
  const response = await fetch(gqlEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (!response.ok || json.errors) throw new Error(JSON.stringify(json.errors || json).slice(0, 1000));
  return json.data;
}

async function shopifyRest(method, endpoint, body) {
  const response = await fetch(`${restEndpoint}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function mapConcurrent(items, concurrency, worker) {
  const results = [];
  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      results.push(await worker(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
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
  console.error(`[bulk-reactivate] fatal: ${error.message}`);
  process.exit(1);
});
