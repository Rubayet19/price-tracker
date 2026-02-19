# Price Tracker - Product Context

## Product Goal
Build a competitor pricing intelligence SaaS that helps a user compare their offer against competitors and get actionable decision suggestions from verified pricing changes.

## Locked Decisions
- Deploy on Vercel Hobby.
- Plans: Starter is `$19/month` with up to `3` competitors.
- Plans: Pro is `$50/month` with up to `10` competitors.
- Trial: user explicitly clicks `Start trial`.
- Trial: lasts `7 days`, no card required.
- Trial: uses Starter limits/features.
- Weekly digest email is for paying users only.
- No proxies in MVP.
- User's own product/pricing data is entered manually (not auto-extracted).
- Decision engine gating: Starter + Trial = high-severity insights only.
- Decision engine gating: Pro = high + medium severity insights.

## Core Constraints
- Vercel Hobby runtime is limited.
- Daily crawl for all competitors must be implemented as frequent short batches, not one large nightly run.
- Keep compute and LLM usage bounded with confidence gates and severity gates.

## Product Principles
- Prefer trustworthy, low-noise output over maximum extraction coverage.
- Separate verified vs unverified change signals.
- Always show confidence and last-checked metadata.
- Keep user control where certainty is low (pricing URL override, manual confirmation paths).

## MVP Scope
- Setup: manual self-plan entry.
- Setup: add competitors (name + homepage).
- Setup: discover pricing URL candidates and allow manual override.
- Setup: show competitor count vs plan limit.
- Setup: offer `Start trial` button when eligible.
- Dashboard: "You vs competitors" comparison view.
- Dashboard: verified changes feed with severity filters.
- Dashboard: trust cues for last checked, confidence, and blocked/manual-needed states.
- Jobs: batch daily crawl route every `10-15` minutes.
- Jobs: weekly digest route for paying users only.

## Data and Domain Model
- User model additions: `trialStartedAt`, `trialEndsAt`, `trialStatus`.
- User model additions: optional digest-tracking timestamp.
- Company model: self/competitor identity and source URLs.
- Company model: scheduling and lease fields (`nextCrawlAt`, `crawlLeaseUntil`).
- Company model: latest crawl status, error, and content hash fields.
- Snapshot model: parsed pricing payload, capture method, confidence, and content hash.
- Diff model: snapshot-to-snapshot normalized diff with severity and verification state.
- Insight model: AI recommendation payload plus model/cost metadata and feedback signal.

## Entitlements and Limits
- Centralize in one entitlements helper.
- Access states: paid (`hasAccess` true) or active trial (`trialStatus` active and not expired).
- Plan tier: paid tier comes from Stripe `priceId` mapping in config.
- Plan tier: trial is always forced to Starter behavior.
- Enforce server-side competitor cap by plan.
- Enforce server-side insight generation by severity gate and cost cap.

## Crawl and Extraction Strategy
- Discovery: crawl homepage links.
- Discovery: score likely pricing URLs.
- Discovery: save candidates with confidence.
- Static-first crawling.
- Stable content hash gate: if unchanged, skip extraction and diff generation.
- Extraction path: heuristics first.
- Playwright fallback only when JS rendering is likely needed and under per-run cap.
- LLM fallback only for low-confidence cases.
- Failure policy: mark blocked/manual-needed.
- Failure policy: apply retry backoff.

## Diff and Insight Policy
- Canonicalize extracted pricing JSON before comparisons.
- Generate low-noise diffs.
- Keep only meaningful, severity-rated changes.
- Gate insight generation by entitlement tier.
- Preserve a verified/unverified distinction across feeds and emails.

## Email Digest Policy
- Weekly only.
- Paying users only.
- Include verified changes from the lookback window.

## Cron and Ops
- Add `vercel.json` schedule for frequent crawl batch route (10-15 min cadence).
- Add `vercel.json` schedule for weekly digest route.
- Protect cron endpoints with `CRON_SECRET`.
- Use lease-based claiming to avoid duplicate crawl work.

## MVP Edge Cases to Support
- "Custom pricing" / contact-sales pages with no explicit numbers.
- Multiple candidate pricing pages (keep one primary in MVP).
- Currency mismatch/non-USD detection where possible.
- Low-confidence extraction should not produce verified diffs/insights.
- Bot-blocked targets should be clearly flagged and backoff scheduled.

## Current Priority Queue
- Implement trial flow and entitlements helper.
- Add models: Company, Snapshot, Diff, Insight.
- Build setup and dashboard screens for onboarding + verified feed.
- Implement lease-based batch crawler with static-first + fallback policy.
- Implement canonicalization, diffing, and plan-gated insights.
- Implement paying-only weekly digest and schedule both cron jobs.
