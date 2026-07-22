# Grok ↔ Shopify Bridge (BoughtItOnline)

This is the bridge that lets Grok (Build/TUI or any agent in this workspace) update the Shopify store: theme, products, collections, and pages.

## What is already in place

| Piece | Status |
|---|---|
| Theme source repo | `C:\Users\MrJws\OneDrive\Workspaces\boughtitonline.com` |
| GitHub | `3000Studios/Boughtitonline` (canonical) |
| Live shop | `knkxfs-xd.myshopify.com` / boughtitonline.com |
| Live theme ID | `181944025389` (Horizon) |
| Product/page scripts | `scripts/*.mjs` via Admin API |
| Theme deploy (CI) | `.github/workflows/shopify-theme-sync.yml` on `main` |
| Cloudflare sites | Separate — see `../PROJECT_REGISTRY.md` + Cloudflare MCP |

## What is missing until you finish one-time auth

1. **Shopify custom app Admin API token** → `SHOPIFY_ADMIN_ACCESS_TOKEN` in `global.env`
2. **Theme Access password or theme-capable token** → `SHOPIFY_CLI_THEME_TOKEN` in `global.env` **and** GitHub repo secret `SHOPIFY_CLI_THEME_TOKEN`
3. (Optional) Shopify CLI browser login for interactive theme work

Without those tokens, Grok can edit theme files locally and push git, but cannot talk to Shopify Admin or push themes live.

---

## One-time setup (you do this in Shopify Admin)

### A) Custom app for Admin API (products, pages, collections)

1. Open **Shopify Admin** → **Settings** → **Apps and sales channels** → **Develop apps**.
2. If an old app exists and the token was lost, either:
   - open it and **reveal / rotate** the Admin API access token, or
   - **Create an app** → name it `Grok AI Bridge` (or similar).
3. **Configure Admin API scopes** (minimum recommended):

   | Scope | Why |
   |---|---|
   | `read_products`, `write_products` | Catalog |
   | `read_content`, `write_content` | Pages / blogs |
   | `read_themes`, `write_themes` | Theme metadata / optional |
   | `read_product_listings`, `write_product_listings` | Online store publication |
   | `read_online_store_navigation`, `write_online_store_navigation` | Menus (if needed) |
   | `read_orders` | Support / ops (read-only) |
   | `read_customers` | Support / ops (read-only) |

4. **Install app** on the store.
5. Copy the **Admin API access token** (starts with `shpat_`).  
   **Paste it only into** `C:\Users\MrJws\OneDrive\Workspaces\global.env` — never into git, chat, or screenshots.

### B) Theme Access (for CLI + GitHub Actions)

Option 1 — Theme Access app (simplest for theme-only):

1. Install [Theme Access](https://apps.shopify.com/theme-access) on the store.
2. Create a password for the live theme / collaborator as needed.
3. That password is `SHOPIFY_CLI_THEME_TOKEN`.

Option 2 — Use a custom app token that includes `write_themes` (Shopify CLI may accept it with `--password`).

### C) Write secrets (local + GitHub)

In `C:\Users\MrJws\OneDrive\Workspaces\global.env` add (or fill):

```env
SHOPIFY_SHOP_DOMAIN=knkxfs-xd.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_...
SHOPIFY_CLI_THEME_TOKEN=shptka_...   # or theme access password
SHOPIFY_THEME_ID=181944025389
SHOPIFY_API_VERSION=2025-10
```

Then set the GitHub Actions secret (from a machine with `gh` auth):

```powershell
cd C:\Users\MrJws\OneDrive\Workspaces\boughtitonline.com
# loads GH token from global.env if needed
gh secret set SHOPIFY_CLI_THEME_TOKEN -R 3000Studios/Boughtitonline
# paste the same theme token when prompted
```

### D) Verify the bridge

```powershell
cd C:\Users\MrJws\OneDrive\Workspaces\boughtitonline.com
npm run bridge:status
```

Expected: `RESULT: CONNECTED` and shop name/domain printed (no secrets printed).

---

## How Grok uses the bridge after connect

| Goal | Command / path |
|---|---|
| Health check | `npm run bridge:status` |
| Pull live theme | `npm run theme:pull` |
| Theme check | `npm run theme:check` |
| Push live theme (local) | `npm run theme:push:live` |
| Deploy via CI | commit + push to `main` (theme paths) |
| Upsert pages | `npm run pages:upsert` |
| Upsert collections | `npm run collections:upsert` |
| Product dry-run | `npm run products:auto:dry-run` |

**Rules**

- GitHub is source of truth for theme code.
- Shopify is source of truth for products, orders, customers, payments.
- Never commit tokens. Prefer dry-run before `--publish`.
- For multi-domain **non-Shopify** sites, use `PROJECT_REGISTRY.md` + Cloudflare MCP — not this Admin token.

---

## Multi-shop expansion

Edit `shopify-stores.json` and add another store object with its own env key names if you add more Shopify shops. Cloudflare portfolio sites stay in the workspace hub, not in this file.

## Console errors (GTM / Ads)

`net::ERR_NAME_NOT_RESOLVED` for `www.googletagmanager.com` or `pagead2.googlesyndication.com` means the **browser cannot resolve Google marketing domains** (DNS, offline, corporate filter, or ad blocker). That is **not** a broken Shopify Admin bridge. Fix network/DNS/adblock, or remove/disable those tags until Google services resolve.
