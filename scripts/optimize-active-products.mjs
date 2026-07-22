import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { loadEnv } from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
loadEnv(args.env);

const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const publish = Boolean(args.publish);
const outputPath = path.resolve(args.output || '../../outputs/shopify-active-product-optimization.json');

if (!shop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!token) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

async function main() {
  const products = await fetchActiveProducts();
  const planned = products
    .map(planProductUpdates)
    .filter((item) => item.needsSeo || item.imageUpdates.length > 0);

  const result = {
    at: new Date().toISOString(),
    mode: publish ? 'publish' : 'dry-run',
    scannedActiveProducts: products.length,
    productsNeedingUpdates: planned.length,
    seoUpdates: planned.filter((item) => item.needsSeo).length,
    imageAltUpdates: planned.reduce((total, item) => total + item.imageUpdates.length, 0),
    updated: [],
    planned,
  };

  if (publish) {
    for (const item of planned) {
      const update = { productId: item.productId, title: item.title, handle: item.handle, seoUpdated: false, imageAltUpdated: 0 };
      if (item.needsSeo) {
        await updateProductSeo(item.numericId, item.seo);
        update.seoUpdated = true;
      }
      for (const image of item.imageUpdates) {
        await updateProductImageAlt(item.numericId, image.id, image.alt);
        update.imageAltUpdated += 1;
      }
      result.updated.push(update);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    scannedActiveProducts: result.scannedActiveProducts,
    productsNeedingUpdates: result.productsNeedingUpdates,
    seoUpdates: result.seoUpdates,
    imageAltUpdates: result.imageAltUpdates,
    updated: result.updated.length,
    outputPath,
  }, null, 2));
}

async function fetchActiveProducts() {
  const products = [];
  let cursor = null;
  const query = `query ActiveProducts($cursor:String) {
    products(first: 100, after: $cursor, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        handle
        productType
        vendor
        descriptionHtml
        seo { title description }
        metafields(first: 20, namespace: "global") {
          nodes { key value }
        }
        featuredMedia {
          ... on MediaImage {
            image { altText }
          }
        }
      }
    }
  }`;

  do {
    const data = await shopifyGraphql(query, { cursor });
    products.push(...data.products.nodes);
    cursor = data.products.pageInfo.endCursor;
  } while (cursor);

  const restProducts = await fetchRestActiveProducts();
  const restById = new Map(restProducts.map((product) => [String(product.id), product]));
  return products.map((product) => {
    const numericId = product.id.split('/').pop();
    return { ...product, numericId, rest: restById.get(numericId) };
  });
}

async function fetchRestActiveProducts() {
  const products = [];
  let pageInfo = null;
  do {
    const endpoint = pageInfo
      ? `/products.json?limit=250&status=active&page_info=${encodeURIComponent(pageInfo)}`
      : '/products.json?limit=250&status=active';
    const { json, nextPageInfo } = await shopifyRest('GET', endpoint);
    products.push(...(json.products || []));
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return products;
}

function planProductUpdates(product) {
  const seo = buildSeo(product);
  const seoMetafields = Object.fromEntries((product.metafields?.nodes || []).map((item) => [item.key, item.value]));
  const needsSeo = seoMetafields.title_tag !== seo.title || seoMetafields.description_tag !== seo.description;
  const imageUpdates = (product.rest?.images || [])
    .filter((image) => !String(image.alt || '').trim())
    .map((image) => ({ id: image.id, alt: buildImageAlt(product, image) }));

  return {
    productId: product.id,
    numericId: product.numericId,
    title: product.title,
    handle: product.handle,
    needsSeo,
    seo,
    imageUpdates,
  };
}

function buildSeo(product) {
  const type = String(product.productType || '').trim();
  const titleBase = type ? `${product.title} | ${type}` : product.title;
  const title = truncate(titleBase, 70);
  const description = truncate(
    `Shop ${product.title} at BoughtitOnline. Review product details, current availability, secure Shopify checkout, and final shipping options before payment.`,
    320,
  );
  return { title, description };
}

function buildImageAlt(product, image) {
  const position = image.position && image.position > 1 ? ` view ${image.position}` : '';
  return truncate(`${product.title}${position}`, 255);
}

async function updateProductSeo(productNumericId, seo) {
  const metafields = await fetchProductGlobalMetafields(productNumericId);
  await upsertProductMetafield(productNumericId, metafields.title_tag?.id, 'title_tag', seo.title);
  await upsertProductMetafield(productNumericId, metafields.description_tag?.id, 'description_tag', seo.description);
}

async function fetchProductGlobalMetafields(productNumericId) {
  const { json } = await shopifyRest('GET', `/products/${productNumericId}/metafields.json?namespace=global&limit=250`);
  return Object.fromEntries((json.metafields || []).map((item) => [item.key, item]));
}

async function upsertProductMetafield(productNumericId, metafieldId, key, value) {
  if (metafieldId) {
    await shopifyRest('PUT', `/products/${productNumericId}/metafields/${metafieldId}.json`, {
      metafield: { id: metafieldId, value, type: 'single_line_text_field' },
    });
    return;
  }
  await shopifyRest('POST', `/products/${productNumericId}/metafields.json`, {
    metafield: {
      namespace: 'global',
      key,
      value,
      type: 'single_line_text_field',
    },
  });
}

async function updateProductImageAlt(productNumericId, imageId, alt) {
  await sleep(300);
  await shopifyRest('PUT', `/products/${productNumericId}/images/${imageId}.json`, {
    image: { id: imageId, alt },
  });
}

async function shopifyGraphql(query, variables = {}) {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
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
  for (let attempt = 1; attempt <= 10; attempt += 1) {
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
    if (response.ok) return { json, nextPageInfo: parseNextPageInfo(response.headers.get('link')) };
    if ([409, 429].includes(response.status) && attempt < 10) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`${method} ${endpoint} failed ${response.status}: ${text.slice(0, 500)}`);
  }
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

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

main().catch((error) => {
  console.error(`[optimize-active-products] fatal: ${error.message}`);
  process.exit(1);
});
