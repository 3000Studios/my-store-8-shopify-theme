# BoughtitOnline Video Ad Creatives + Channel Setup Guide

**Positioning to test**: "Useful finds. Fair prices. No nonsense." | "No fake scarcity or ridiculous markups." | Practical everyday essentials at prices that make sense.

All creatives must be truthful, no fake urgency, no invented reviews or claims.

## 15-30s Ad Creative Recipes (Ready-to-Run)

**Source assets** (in theme assets/):
- bought-it-online-hero.mp4 (main hero)
- bought-it-online-opener.mp4
- home-and-living.mp4
- tech-accessories.mp4
- sports-and-outdoors.mp4

### Core Hook Variations (value-focused, test these)
1. "Fair prices, no nonsense."
2. "Useful finds without ridiculous prices."
3. "No fake scarcity — just practical essentials."
4. "Everyday upgrades that actually make sense."
5. "Shop smarter. Pay less. No games."

### Recommended 15-20s Vertical (9:16) for TikTok / Instagram Reels / Meta Stories
Use these exact timings + text overlays (white bold text, subtle shadow, bottom or center, 2-3 lines max).

**Creative 1: Hero Value (15s)**
- 0-3s: Hero video clip (product montage or opener)
- 3-8s: Text overlay fades in: "Useful finds. Fair prices."
- 8-12s: "No fake scarcity. No ridiculous markups."
- 12-15s: CTA text + logo: "Shop BoughtitOnline" + arrow or button visual
- Audio: Original or upbeat minimal (keep low)

**Creative 2: Deals Focus (18s)**
- Focus on deals-under-25 collection feel
- Hook: "Smart upgrades under $25 that actually work."
- End: "No nonsense pricing."

**Creative 3: Category Specific (20s)**
- Tech: "Tech that makes daily life easier — without the markup."
- Home: "Home essentials that feel premium but cost less."
- Sports/Outdoor: "Gear for real life. Fair prices, built to last."

### How to Produce (FFmpeg Commands — Run Locally)

```bash
# 1. Trim hero to 15s highlight (example timestamps — adjust after preview)
ffmpeg -i assets/bought-it-online-hero.mp4 -ss 00:00:02 -t 15 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart assets/ad-hero-15s.mp4

# 2. Add text overlay (example for hook)
ffmpeg -i assets/ad-hero-15s.mp4 -vf "drawtext=text='Useful finds. Fair prices.':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-120, drawtext=text='No nonsense.':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-70" -c:a copy assets/ad-hero-final.mp4

# Vertical crop for Reels/TikTok (example)
ffmpeg -i assets/ad-hero-final.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:v libx264 -crf 23 -preset medium -c:a aac assets/ad-hero-vertical.mp4

# Repeat for other hooks/videos. Test 3-5 variations.
```

**Tips**: Keep text large, high contrast, on for 3-5s. Test with/without voiceover. Export H.264 + AAC for max compatibility. Add subtle logo watermark if desired.

## Shopify Channel Setup (Google, Meta, TikTok)

1. **Google Shopping / Performance Max**:
   - In Shopify Admin > Sales channels > Google > Connect + set up feed.
   - Use existing collection structure + product data. Highlight price + "practical essentials" in titles/descriptions.
   - Enable Performance Max with video assets above.

2. **Meta (Facebook/Instagram) + TikTok**:
   - Sales channels > Meta or TikTok > Connect.
   - Upload the 15-30s vertical creatives.
   - Targeting: Interests in home, tech, outdoor, practical living. Lookalike from buyers.
   - Creative test: Value hooks above + video views objective first.
   - Retargeting: Site visitors + video viewers (use the hero video hero as warm audience).

## Email/SMS Flows (Already Documented)

See `docs/marketing/email-flows.md` for ready Welcome, Abandoned Cart, Post-Purchase, and Winback templates. Import into Shopify Email, Klaviyo, or Omnisend. All copy avoids fake scarcity.

**On-site support**: Make email signup prominent on home (hero or footer) and collection pages. The updated hero + video banners reinforce the value message that flows support.

## A/B Testing & Exit-Intent Recommendations

- Use a Shopify A/B testing app (e.g., Google Optimize alternative or native if available) for hero CTA variations.
- For exit-intent: Add simple JS listener for mouseleave on desktop or tab switch. Trigger existing email signup modal or a clean popup with the value prop.
- Track with UTM params on hero CTAs (e.g., ?utm_source=hero&utm_medium=site).

**Next**: After producing 3-5 ad variants, launch small budget tests ($20-50/day) on Meta/TikTok with the value hooks. Measure video view rate + add-to-cart. Scale winners.

All assets and copy stay truthful to the store positioning.
