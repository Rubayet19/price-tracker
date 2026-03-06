---
paths:
  - "libs/crawler/**"
  - "app/api/cron/crawl/**"
---

# Crawl Pipeline

Core loop in `libs/crawler/`:

1. `runner.ts` — Lease-based batch claiming (`/api/cron/crawl`, every 15 min via `vercel.json`)
2. `extract.ts` — Heuristic extraction → `playwright-extract.ts` fallback → `manual_needed` if both fail
3. `normalize.ts` — Canonicalize pricing JSON before diffing
4. `diff.ts` — Normalized diffs with severity (`low | medium | high`) and plan-level changes (tier names → price deltas)
5. `insight.ts` — LLM insights (gpt-4o-mini) with rules-v1 fallback, gated by plan severity tier
6. `discovery.ts` — Homepage link scoring for pricing URL candidates

Hash gating: if `contentHash` unchanged, skip extraction and diff entirely.

## Extraction

**Static → Playwright fallback triggers when any of:**

- Interactive cadence signals (both "monthly" and "yearly"/"annual" text)
- Prices found but zero plan names from h-tags
- Prices found but zero `extractedPlans` paired
- Implausible price spread (max/min ratio ≥ 100 or max ≥ $5,000)
- Confidence below threshold (default 0.82)

**`toPeriod` detection order:** yearly → monthly → annual → daily → one-time → fallback to active cadence or "unknown"

**`isLikelyPlanName` rejects:** strings with digits, punctuation, >28 chars, >4 words, currency codes (USD/EUR/GBP), marketing terms (pricing, faq, features, compare, per month, billed, trial, money-back, etc.)

**`buildExtractedPlans` period inference (3 tiers):**

1. Card-level: `toPeriod` from card text + active toggle cadence
2. Sibling inference: if "unknown", infer from siblings with known periods
3. Page-text fallback: scan full page body for `/month`, `per month`, etc.

Cards with "per day" text skipped entirely (marketing conversions like "~$0.28 per day").

**`classifyPricingModel`:** Returns `custom_only` only when custom hints exist AND zero concrete prices in extractedPlans/priceMentions. Sites with both "contact sales" and real prices → classified by recurring cadences, not custom-only.
