# My Store 8 Shopify Operations

## Deployment

Production is deployed directly to Shopify theme:

- Store: `knkxfs-xd.myshopify.com`
- Live theme: `Horizon`
- Theme ID: `181639479597`

Use this repo as the source of truth. Run all commands from the repo root.

```powershell
npm run theme:pull
npm run theme:check
npm run theme:push -- --no-color
```

GitHub Actions also deploys theme changes pushed to `main` after Theme Check passes. See `docs/theme-sync-automation.md`.

## Product Import

Use Shopify native CSV import first. Keep new imports as drafts until supplier cost, shipping, claims, and product images are verified.

Required checks before publishing:

- Supplier cost is known.
- Shipping cost and timing are known.
- Retail price has positive margin after product cost, shipping, fees, and expected refunds.
- Product title is customer-friendly.
- Description is factual.
- Product media shows the actual item.
- No trademark, medical, piracy, fake-review, or prohibited claims.

## Media Workflow

Create square product images:

```powershell
npm run media:square -- -InputPath input.jpg -OutputPath output.jpg
```

Create vertical product ad videos:

```powershell
npm run media:vertical-ad -- -InputImage product.jpg -OutputVideo product-ad.mp4 -Caption "Practical everyday upgrade"
```

Only use real product images or videos that the store has the right to use.

## App Policy

Do not install paid apps until product margin, policies, checkout, and domain are launch-ready.

Safe first approvals:

- One free product reviews app with photo/video review support.
- One free bulk import/data importer app only if Shopify native CSV import is too slow.

Do not publish fake testimonials, cloned competitor copy, or imported reviews unless there is clear legal permission.
