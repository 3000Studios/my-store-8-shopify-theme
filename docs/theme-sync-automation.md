# Shopify Theme Sync Automation

This repo deploys the live Shopify storefront theme through Shopify's native GitHub theme integration. GitHub Actions is not used.

## Live Target

- Store: `knkxfs-xd.myshopify.com`
- Theme: `Horizon`
- Theme ID: `181944025389`
- Connection: Shopify Admin → Online Store → Themes → Connect from GitHub → `3000Studios/Boughtitonline` / `main`

## How It Works

After a validated push to `main`, Shopify syncs the connected theme automatically. Shopify also commits theme-editor changes back to the connected branch.

## Manual Deploy

For an owner-approved recovery deploy before the native connection is established, run from the repo root:

```powershell
npm run theme:check
npm run theme:push -- --no-color
```

## Rollback

Use Shopify Admin theme history for a fast rollback, or revert the offending git commit and push `main` again.

## Safety Rules

- Keep GitHub as the source of truth for theme code.
- Keep Shopify as the source of truth for products, orders, customers, markets, and payments.
- Do not store Shopify tokens in repo files.
- Do not bypass Theme Check for production theme deploys.
