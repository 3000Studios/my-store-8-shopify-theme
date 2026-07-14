param(
  [string]$EnvPath = "C:\Users\Servi\.config\env\global.env",
  [string]$ShopDomain = "knkxfs-xd.myshopify.com",
  [string]$ThemeId = "181639479597",
  [switch]$OpenAppInstallPages,
  [switch]$RunBulkDryRun,
  [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)
  Write-Host "WARN $Message" -ForegroundColor Yellow
}

function Assert-Command {
  param(
    [string]$Name,
    [string]$InstallHint
  )
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is not installed or not in PATH. $InstallHint"
  }
  Write-Ok "$Name found"
}

function Read-MaskedEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) {
    Write-WarnLine "Env file not found: $Path"
    return $map
  }
  Get-Content -LiteralPath $Path | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
      $map[$Matches[1]] = "present, masked"
    }
  }
  return $map
}

function Require-EnvNames {
  param(
    [hashtable]$EnvMap,
    [string[]]$Names
  )
  $missing = @()
  foreach ($name in $Names) {
    if ($EnvMap.ContainsKey($name)) {
      Write-Ok "$name=$($EnvMap[$name])"
    } else {
      $missing += $name
      Write-WarnLine "$name=missing"
    }
  }
  return $missing
}

function New-DirectoryIfMissing {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Write-TextFile {
  param(
    [string]$Path,
    [string]$Content
  )
  New-DirectoryIfMissing -Path (Split-Path -Parent $Path)
  Set-Content -LiteralPath $Path -Value $Content -Encoding UTF8
  Write-Ok "wrote $Path"
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location -LiteralPath $RepoRoot

Write-Step "Store operations bootstrap"
Write-Host "Repo: $RepoRoot"
Write-Host "Shop: $ShopDomain"
Write-Host "Theme: $ThemeId"

Write-Step "Checking required local tools"
Assert-Command -Name "node" -InstallHint "Install Node.js LTS from https://nodejs.org/"
Assert-Command -Name "npm" -InstallHint "Install Node.js LTS from https://nodejs.org/"
Assert-Command -Name "git" -InstallHint "Install Git for Windows from https://git-scm.com/download/win"

$nodeVersion = node --version
$npmVersion = npm --version
$gitVersion = git --version
Write-Host "node=$nodeVersion"
Write-Host "npm=$npmVersion"
Write-Host "$gitVersion"

Write-Step "Checking env names without printing secrets"
$envMap = Read-MaskedEnv -Path $EnvPath
$missing = @(Require-EnvNames -EnvMap $envMap -Names @(
  "SHOPIFY_ADMIN_ACCESS_TOKEN",
  "SHOPIFY_API_TOKEN",
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_SHOP",
  "SHOPIFY_API_VERSION"
))
if ($missing.Count -gt 0) {
  Write-WarnLine "Some Shopify env names are missing. API automation may fail until they are added to $EnvPath."
}

Write-Step "Installing repo dependencies"
if ($SkipNpmInstall) {
  Write-WarnLine "Skipping npm install because -SkipNpmInstall was set"
} else {
  npm install
}

Write-Step "Checking Shopify CLI availability"
npx shopify version

Write-Step "Repo and secret hygiene scan"
git status --short --branch
if (Get-Command rg -ErrorAction SilentlyContinue) {
  $secretHits = rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!package-lock.json' --glob '!scripts/bootstrap-store-ops.ps1' "(shpat_|sk_live_|sk_test_|AKIA[0-9A-Z]{16}|BEGIN RSA PRIVATE KEY|SHOPIFY_ADMIN_ACCESS_TOKEN\s*=|SHOPIFY_API_TOKEN\s*=)" . 2>$null
  if ($secretHits) {
    Write-WarnLine "Potential secret-looking strings found. Review before committing:"
    $secretHits | Select-Object -First 30 | ForEach-Object { Write-Host $_ -ForegroundColor Yellow }
  } else {
    Write-Ok "No obvious hardcoded secret patterns found"
  }
} else {
  Write-WarnLine "ripgrep not found; skipping fast secret scan"
}

Write-Step "Theme validation"
npm run theme:check

Write-Step "Product gate dry runs"
node --check scripts\activation-gate.mjs
node --check scripts\auto-product-publisher.mjs
node --check scripts\bulk-reactivate-products.mjs
npm run products:auto:dry-run
if ($RunBulkDryRun) {
  npm run products:bulk:dry-run -- --max 100 --concurrency 12 --shippingBuffer 7.99 --maxPrice 79.99 --mode conversion
}

Write-Step "Creating marketing flow templates"
$marketingDir = Join-Path $RepoRoot "docs\marketing"

Write-TextFile -Path (Join-Path $marketingDir "email-flows.md") -Content @'
# BoughtitOnline Email/SMS Flow Templates

Use these in Shopify Email, Klaviyo, Omnisend, or another email/SMS tool. Do not make fake claims, fake scarcity, or fake reviews.

## Welcome Flow

Trigger: customer subscribes.

Email 1, immediate:
Subject: Welcome to BoughtitOnline
Goal: explain useful everyday finds, safe checkout, and current best picks.
CTA: Shop Best Sellers

Email 2, 24 hours:
Subject: Small upgrades that make daily life easier
Goal: show 3-5 verified products under the profit gate.
CTA: Browse New Finds

Email 3, 72 hours:
Subject: Still looking? Start here.
Goal: route by category: Home, Tech, Outdoor.
CTA: Pick a Category

## Abandoned Cart Flow

Trigger: cart started, no checkout.

Email 1, 1 hour:
Subject: You left this behind
CTA: Return to cart

Email 2, 20 hours:
Subject: Still interested?
CTA: Finish checkout

Email 3, 48 hours:
Subject: Last reminder on your cart
CTA: Complete order

## Post-Purchase Flow

Email 1, immediate:
Subject: Thanks for your order
Goal: set expectations for processing/shipping.

Email 2, after fulfillment:
Subject: Your order is on the way
Goal: reinforce support contact and tracking.

Email 3, 14 days after delivery:
Subject: How did we do?
Goal: request review if allowed by installed reviews app.

## Winback Flow

Trigger: no purchase in 45 days.
Subject: New useful finds are live
CTA: Browse Best Sellers
'@

Write-TextFile -Path (Join-Path $marketingDir "ad-copy-starters.md") -Content @'
# Ad Copy Starters

Rules:
- Do not use fake bonuses, fake urgency, fake reviews, or false scarcity.
- Match ad product to landing collection.
- Keep claims practical and product-specific.

## Home & Living
Primary: Useful home upgrades without the big-store scroll.
Headline: Everyday home finds
CTA: Shop Home Picks

## Tech Accessories
Primary: Desk, phone, and gadget accessories selected for practical daily use.
Headline: Small tech upgrades
CTA: Shop Tech Accessories

## Outdoor & Sports
Primary: Outdoor and sports finds that are easy to add to your routine.
Headline: Gear up for outside
CTA: Shop Outdoor Picks

## Retargeting
Primary: Still thinking it over? Your cart is ready when you are.
Headline: Come back to your picks
CTA: Return to cart
'@

Write-TextFile -Path (Join-Path $marketingDir "supplier-feed-requirements.md") -Content @'
# Supplier Feed Requirements

Every supplier feed must include:
- title
- supplier SKU
- product cost
- shipping cost or reliable shipping estimate
- inventory quantity
- shipping time in days
- image URLs
- category
- product dimensions or weight when available

Hard publish gate:
- buyer price covers product cost, supplier shipping, processing fees, platform buffer, refund buffer, discount buffer, ad/testing buffer
- net profit >= 5.00
- net margin >= 25%
- supplier verified
- inventory available
- shipping time <= 12 days
- real images
- not high risk

Recommended tools:
- AutoDS for fast multi-supplier product sourcing and automation.
- Inventory Source for larger supplier catalog automation.
- Stock Sync for supplier CSV/XML/FTP/API feeds.
- Matrixify for bulk Shopify import/export and scheduled file jobs.
'@

Write-Step "Writing app install/setup checklist"
Write-TextFile -Path (Join-Path $RepoRoot "docs\store-app-stack.md") -Content @'
# Store App Stack

These apps generally require Shopify admin approval and may have billing implications. This script opens setup pages but does not approve charges or grant permissions automatically.

## Inventory and Sourcing

1. AutoDS
Purpose: fast product sourcing, bulk imports, price/stock sync, fulfillment automation.
URL: https://apps.shopify.com/autods

2. Inventory Source
Purpose: larger supplier catalogs, inventory sync, order routing.
URL: https://www.inventorysource.com/

3. Stock Sync by syncX
Purpose: supplier CSV/XML/FTP/API product and inventory sync.
URL: https://apps.shopify.com/stock-sync

4. Matrixify
Purpose: bulk Shopify import/export, scheduled CSV/Excel/FTP jobs.
URL: https://apps.shopify.com/excel-export-import

## Marketing and Conversion

5. Shopify Email
Purpose: basic email marketing using Shopify customer/order data.
URL: https://apps.shopify.com/shopify-email

6. Shopify Search & Discovery
Purpose: product recommendations, filters, search relevance.
URL: https://apps.shopify.com/search-and-discovery

7. Judge.me Product Reviews
Purpose: collect real product reviews. Do not import fake reviews.
URL: https://apps.shopify.com/judgeme

8. Shopify Inbox
Purpose: live chat and customer support.
URL: https://apps.shopify.com/inbox

## Analytics

9. Google & YouTube
Purpose: Google Merchant Center, Google Ads, product feed, YouTube.
URL: https://apps.shopify.com/google

10. Microsoft Channel
Purpose: Bing/Microsoft product listings and ads.
URL: https://apps.shopify.com/microsoft
'@

if ($OpenAppInstallPages) {
  Write-Step "Opening app setup pages for manual approval"
  $urls = @(
    "https://apps.shopify.com/autods",
    "https://www.inventorysource.com/",
    "https://apps.shopify.com/stock-sync",
    "https://apps.shopify.com/excel-export-import",
    "https://apps.shopify.com/shopify-email",
    "https://apps.shopify.com/search-and-discovery",
    "https://apps.shopify.com/judgeme",
    "https://apps.shopify.com/inbox",
    "https://apps.shopify.com/google",
    "https://apps.shopify.com/microsoft"
  )
  foreach ($url in $urls) {
    Start-Process $url
  }
} else {
  Write-WarnLine "App install pages were not opened. Re-run with -OpenAppInstallPages when ready to approve Shopify app permissions/charges."
}

Write-Step "Final storefront smoke check"
try {
  $storefrontResponse = Invoke-WebRequest -Uri "https://boughtitonline.com/?bootstrap=1" -UseBasicParsing -TimeoutSec 30 -Headers @{ "Cache-Control" = "no-cache" }
  Write-Ok "boughtitonline.com returned HTTP $($storefrontResponse.StatusCode)"
} catch {
  Write-WarnLine "Storefront smoke check failed: $($_.Exception.Message)"
}

Write-Step "Done"
Write-Host "Next commands:"
Write-Host "  npm run products:bulk:dry-run -- --max 100 --concurrency 12 --shippingBuffer 7.99 --maxPrice 79.99 --mode conversion"
Write-Host "  npm run products:bulk:publish -- --max 100 --concurrency 12 --shippingBuffer 7.99 --maxPrice 79.99 --mode conversion"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bootstrap-store-ops.ps1 -OpenAppInstallPages -RunBulkDryRun"
