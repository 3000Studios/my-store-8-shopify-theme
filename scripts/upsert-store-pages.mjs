import fs from 'node:fs';

import { loadEnv } from './lib/env.mjs';

const args = parseArgs(process.argv.slice(2));
loadEnv(args.env);

const shop = process.env.SHOPIFY_SHOP_DOMAIN || process.env.SHOPIFY_SHOP || process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || process.env.SHOPIFY_API_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const publish = args.publish !== false;

if (!shop) throw new Error('Missing SHOPIFY_SHOP_DOMAIN/SHOPIFY_SHOP in env.');
if (!token) throw new Error('Missing SHOPIFY_ADMIN_ACCESS_TOKEN/SHOPIFY_API_TOKEN in env.');

const pages = [
  {
    title: 'About BoughtitOnline',
    handle: 'about-boughtitonline',
    body_html: `
      <div class="ms8-page-rte">
        <p>BoughtitOnline is built around practical products for everyday home, tech, outdoor, and gift shopping.</p>
        <p>We focus on useful items, clear pricing, secure checkout, and a growing catalog that is screened before products are made visible.</p>
        <h2>How we choose products</h2>
        <ul>
          <li>Supplier and inventory checks before publication.</li>
          <li>Real product media where available.</li>
          <li>Pricing reviewed against product cost, shipping buffers, processing fees, and return risk.</li>
          <li>High-risk, restricted, medical, counterfeit, or unclear-brand products are kept out of the live catalog.</li>
        </ul>
      </div>`,
  },
  {
    title: 'Shipping Information',
    handle: 'shipping-information',
    body_html: `
      <div class="ms8-page-rte">
        <p>Shipping options, delivery estimates, taxes, and any available carrier details are shown at checkout before payment.</p>
        <h2>What to expect</h2>
        <ul>
          <li>Orders are processed after payment confirmation.</li>
          <li>Delivery timing can vary by product, carrier, destination, and seasonal volume.</li>
          <li>If tracking is available for your order, it will be shared by email or through the order status page.</li>
        </ul>
        <p>For order-specific shipping help, contact the support team with your order number.</p>
      </div>`,
  },
  {
    title: 'Returns & Order Help',
    handle: 'returns-order-help',
    body_html: `
      <div class="ms8-page-rte">
        <p>If something arrives damaged, incorrect, incomplete, or different from what you ordered, contact the support team as soon as possible with your order number and photos when relevant.</p>
        <h2>Before requesting help</h2>
        <ul>
          <li>Keep the packaging and product until the support team responds.</li>
          <li>Include the order number, email used at checkout, and a short description of the issue.</li>
          <li>For damaged items, include clear photos of the product and packaging.</li>
        </ul>
        <p>Refund and return eligibility may depend on the product, order status, supplier rules, and applicable store policy.</p>
      </div>`,
  },
  {
    title: 'FAQ',
    handle: 'faq',
    body_html: `
      <div class="ms8-page-rte">
        <h2>How do I contact support?</h2>
        <p>Use the contact page and include your order number if your question is order-related.</p>
        <h2>How are products priced?</h2>
        <p>Live products are priced to cover product cost, estimated shipping buffer, payment processing, platform overhead, return risk, discounts, testing budget, and required profit.</p>
        <h2>Why does the catalog change?</h2>
        <p>Products may be added, removed, drafted, or repriced as supplier inventory, media, shipping, or cost information changes.</p>
        <h2>Is checkout secure?</h2>
        <p>Checkout is handled through Shopify's secure checkout system.</p>
      </div>`,
  },
  {
    title: 'Gift Ideas',
    handle: 'gift-ideas',
    body_html: `
      <div class="ms8-page-rte">
        <p>Shop practical gift ideas across home, tech, outdoor, and daily-use essentials.</p>
        <div class="ms8-page-link-grid">
          <a href="/collections/home-living">Home & Living Gifts</a>
          <a href="/collections/tech-accessories">Tech Accessories</a>
          <a href="/collections/outdoor-sports">Outdoor & Sports</a>
          <a href="/collections/all">Shop All Products</a>
        </div>
      </div>`,
  },
  {
    title: 'Product Screening Standards',
    handle: 'product-screening-standards',
    body_html: `
      <div class="ms8-page-rte">
        <p>Before products are published, the store uses a screening gate designed to avoid unsafe pricing and risky listings.</p>
        <h2>Publication requirements</h2>
        <ul>
          <li>Supplier signal is present and reviewed.</li>
          <li>Inventory is available.</li>
          <li>Product media is present.</li>
          <li>Estimated shipping timing is within the active threshold.</li>
          <li>Price covers product cost, shipping buffer, processing, platform, return, discount, and testing buffers.</li>
          <li>Expected net profit and net margin meet the store's minimums.</li>
        </ul>
      </div>`,
  },
  {
    title: 'Secure Checkout',
    handle: 'secure-checkout',
    body_html: `
      <div class="ms8-page-rte">
        <p>BoughtitOnline uses Shopify checkout for payment processing and order confirmation.</p>
        <h2>Checkout tips</h2>
        <ul>
          <li>Review product, shipping, taxes, and total price before placing an order.</li>
          <li>Use an email address you can access so order updates reach you.</li>
          <li>Keep your order confirmation for support questions.</li>
        </ul>
      </div>`,
  },
  {
    title: 'Best Sellers',
    handle: 'best-sellers',
    body_html: `
      <div class="ms8-page-rte">
        <p>Browse current featured picks and active products selected from the live catalog.</p>
        <div class="ms8-page-link-grid">
          <a href="/collections/all?sort_by=best-selling">Best-selling Products</a>
          <a href="/collections/all?sort_by=created-descending">Newest Products</a>
          <a href="/collections/all?sort_by=price-ascending">Lowest Prices</a>
        </div>
      </div>`,
  },
];

async function main() {
  const existing = await fetchPages();
  const results = [];
  for (const page of pages) {
    const current = existing.find((item) => item.handle === page.handle);
    const result = current ? await updatePage(current.id, page) : await createPage(page);
    results.push({ title: result.page.title, handle: result.page.handle, id: result.page.id });
  }
  console.log(JSON.stringify({ shop, publish, upserted: results.length, pages: results }, null, 2));
}

async function fetchPages() {
  const pages = [];
  let pageInfo = null;
  do {
    const endpoint = pageInfo ? `/pages.json?limit=250&page_info=${encodeURIComponent(pageInfo)}` : '/pages.json?limit=250';
    const { json, nextPageInfo } = await shopifyRest('GET', endpoint);
    pages.push(...(json.pages || []));
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return pages;
}

async function createPage(page) {
  return (await shopifyRest('POST', '/pages.json', { page: normalizePage(page) })).json;
}

async function updatePage(id, page) {
  return (await shopifyRest('PUT', `/pages/${id}.json`, { page: { ...normalizePage(page), id } })).json;
}

function normalizePage(page) {
  return {
    title: page.title,
    handle: page.handle,
    body_html: compactHtml(page.body_html),
    published: publish,
  };
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

function compactHtml(html) {
  return String(html).replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'draft') {
      parsed.publish = false;
    } else {
      parsed[key] = rawArgs[i + 1];
      i += 1;
    }
  }
  return parsed;
}

main().catch((error) => {
  console.error(`[upsert-store-pages] fatal: ${error.message}`);
  process.exit(1);
});
