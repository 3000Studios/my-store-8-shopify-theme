# BoughtItOnline Shopify Theme

Source-of-truth repo for the BoughtItOnline (`knkxfs-xd`) Shopify storefront theme and Admin API ops scripts.

## Source Of Truth

- GitHub (`3000Studios/Boughtitonline`) is the source of truth for theme code, CSS, scripts, docs, and deployment history.
- Shopify is the source of truth for products, orders, customers, payments, inventory, policies, and the live storefront runtime.

## AI / Grok Bridge

Grok and other agents connect through workspace secrets + this repo. See **[docs/ai-shopify-bridge.md](docs/ai-shopify-bridge.md)** and run:

```powershell
npm run bridge:status
```

## Production Deployment

- Store: `knkxfs-xd.myshopify.com`
- Public domain: boughtitonline.com
- Live theme: `Horizon`
- Theme ID: `181944025389`

Deploy with Shopify CLI:

```powershell
npm install
npm run theme:check
npm run theme:push:live -- --no-color
```

Automated sync deploys run through GitHub Actions on pushes to `main`. See [docs/theme-sync-automation.md](docs/theme-sync-automation.md) for the required `SHOPIFY_CLI_THEME_TOKEN` repository secret and rollback notes.

## Local Workflow

Pull current Shopify theme state before editing:

```powershell
npm run theme:pull
```

Check theme quality:

```powershell
npm run theme:check
```

Push approved changes live:

```powershell
npm run theme:push -- --no-color
```

## Product And Media Operations

See [docs/operations.md](docs/operations.md) for bulk import, product safety checks, and zero-cost media scripts.
