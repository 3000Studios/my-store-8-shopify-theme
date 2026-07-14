# Shopify Theme Sync Automation

This repo deploys the live Shopify storefront theme through GitHub Actions.

## Live Target

- Store: `knkxfs-xd.myshopify.com`
- Theme: `Horizon`
- Theme ID: `181639479597`
- Workflow: `.github/workflows/shopify-theme-sync.yml`

## How It Works

Pushes to `main` that touch theme files run:

1. `npm ci`
2. `npm run theme:check -- --no-color`
3. `npx shopify theme push --allow-live`

The deploy job only runs after Theme Check passes.

## Required GitHub Secret

Configure this repository secret before expecting automated live deploys:

- `SHOPIFY_CLI_THEME_TOKEN`

Use a Shopify Theme Access password or a custom app access token with theme write access. Do not commit the token to the repo.

With GitHub CLI, set it interactively:

```powershell
gh secret set SHOPIFY_CLI_THEME_TOKEN
```

Paste the token when prompted. The value is sent to GitHub as a repository secret and is not printed by the CLI.

## Manual Deploy

Run from the repo root:

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
