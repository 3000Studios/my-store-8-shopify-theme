# Auto Product Publisher

This tool publishes products only after supplier, inventory, media, shipping, and profit checks pass.

It is intentionally not a blind catalog spammer. If a product does not have verified cost, shipping, inventory, and real images, the tool rejects it or leaves it ready in dry-run mode.

## Commands

Dry run once:

```powershell
npm run products:auto:dry-run
```

Publish one batch:

```powershell
npm run products:auto:publish-once
```

Watch continuously in dry-run mode:

```powershell
npm run products:auto:watch
```

Watch continuously and publish passing products:

```powershell
npm run products:auto:watch-publish
```

## Queue File

Default queue:

```text
data/auto-product-queue.json
```

Example:

```text
data/auto-product-queue.example.json
```

Each product must include:

- `title`
- `supplierName` or `supplierProductId`
- `productCost`
- `supplierShipping`
- `shippingDays`
- `inventoryAvailable: true`
- `hasRealImages: true`
- at least one real image URL in `images`

Optional:

- `shopifyProductId` to update and publish an existing draft
- `preferredPrice`
- `variants`
- `tags`
- `productType`

## Profit Gate

The tool calculates:

```text
landed_cost = product_cost + supplier_shipping
payment_fee = price * 0.03 + 0.30
platform_buffer = price * 0.03
refund_return_buffer = price * 0.08
discount_buffer = price * 0.05
ad_testing_buffer = price * 0.10
total_cost = landed_cost + payment_fee + platform_buffer + refund_return_buffer + discount_buffer + ad_testing_buffer
net_profit = price - total_cost
net_margin = net_profit / price
```

Publish gate:

```text
net_profit >= 5.00
net_margin >= 25%
shipping_days <= 12
inventory_available = true
has_real_images = true
supplier_verified = true
not_high_risk = true
```

## Risk Rejections

The tool rejects products with medical claims, branded/IP risk, weapons, vape/CBD/nicotine, smart TV/IPTV, auto clickers, and similar high-risk terms.

The tool also rejects products that have missing, placeholder, example, dummy, or non-HTTP image URLs. Real media must be verified before a product can publish.

## Logs

Default log:

```text
logs/auto-product-publisher.jsonl
```

Logs are local runtime artifacts and should not be committed.
