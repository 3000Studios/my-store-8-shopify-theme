# AI Operations — BoughtItOnline (Shopify)

This is the direct instruction file for Grok, Codex, and other agents. Canonical branch: `main`. Canonical production repository: **3000Studios/Boughtitonline**. Local path: `C:\Users\MrJws\OneDrive\Workspaces\boughtitonline.com`.

## Before any change

1. Read this file, `README.md`, `docs/ai-shopify-bridge.md`, and `shopify-stores.json`.
2. Run `npm run bridge:status` to confirm Shopify Admin credentials load from the workspace `global.env`.
3. Inspect git status/remote. Prefer working on `main` or a short-lived branch that merges cleanly to `main`.
4. Preserve unrelated local changes. Make the smallest complete change.

## Bridge contract (Grok can update the shop when tokens exist)

| Capability | How |
|---|---|
| Theme code | Edit files → `npm run theme:check` → push git `main` (Actions) and/or `npm run theme:push:live` |
| Products / collections / pages | Node scripts under `scripts/` using Admin API token |
| Other portfolio sites | Not Shopify — use `../PROJECT_REGISTRY.md` + Cloudflare MCP / Wrangler |

Secrets live only in `C:\Users\MrJws\OneDrive\Workspaces\global.env` and GitHub Actions secrets. Never commit them.

Required env names:

- `SHOPIFY_SHOP_DOMAIN=knkxfs-xd.myshopify.com`
- `SHOPIFY_ADMIN_ACCESS_TOKEN` (custom app `shpat_…`)
- `SHOPIFY_CLI_THEME_TOKEN` (Theme Access password or theme-capable token)
- `SHOPIFY_THEME_ID=181944025389`
- `SHOPIFY_API_VERSION=2025-10` (or current stable)

If bridge status is not CONNECTED, stop API/theme deploys and tell the user which secret is missing (see `docs/ai-shopify-bridge.md`).

## Production targets

- Store: `knkxfs-xd.myshopify.com`
- Public: boughtitonline.com
- Live theme: Horizon `181944025389`
- Deploy path: Shopify only (never Cloudflare for this domain)

## Validation

- Theme: `npm run theme:check` before live push.
- Product scripts: dry-run first; only use `--publish` when the user asked for live catalog changes.
- After theme deploy: verify homepage, collection, product, cart, checkout handoff on desktop and mobile.
- Never invent deploy success or print secrets.

## Workspace hub

When this repo sits under the 3000Studios workspace, also follow `../AI_WORKSPACE_HUB.md` and `../PROJECT_REGISTRY.md` for the full multi-site portfolio. Shopify is the documented exception to Cloudflare deploy rules.
