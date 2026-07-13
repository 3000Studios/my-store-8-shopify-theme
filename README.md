# My Store 8 Shopify Theme

Source-of-truth repo for the `knkxfs-xd` Shopify storefront theme.

## Source Of Truth

- GitHub is the source of truth for theme code, CSS, scripts, docs, and deployment history.
- Shopify is the source of truth for products, orders, customers, payments, inventory, policies, and the live storefront runtime.

## Production Deployment

- Store: `knkxfs-xd.myshopify.com`
- Live theme: `Horizon`
- Theme ID: `181639479597`

Deploy with Shopify CLI:

```powershell
npm install
npm run theme:check
npm run theme:push -- --no-color
```

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
