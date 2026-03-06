# Product Context

## Product Goal

Build a competitor pricing intelligence SaaS that helps a user compare their offer against competitors and get actionable decision suggestions from verified pricing changes.

## Locked Decisions

- Deploy on Vercel Hobby.
- Plans: Starter is `$19/month` with up to `3` competitors.
- Plans: Pro is `$49/month` with up to `10` competitors.
- Trial: user explicitly clicks `Start trial`.
- Trial: lasts `7 days`, no card required.
- Trial: uses Starter limits/features.
- Weekly digest email is for paying users only.
- No proxies.
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

## Diff and Insight Policy

- Canonicalize extracted pricing JSON before comparisons.
- Generate low-noise diffs with plan-level changes (tier names mapped to price deltas).
- Keep only meaningful, severity-rated changes.
- Gate insight generation by entitlement tier.
- LLM insight generation (gpt-4o-mini) with rules-v1 fallback. Plan-level changes included in LLM prompt.
- Preserve verified/unverified distinction across feeds and emails.

## Email Digest Policy

- Weekly only.
- Paying users only.
- Include verified changes from the lookback window.

## Edge Cases to Support

- "Custom pricing" / contact-sales pages with no explicit numbers.
- Multiple candidate pricing pages (keep one primary).
- Currency mismatch/non-USD detection where possible.
- Low-confidence extraction should not produce verified diffs/insights.
- Bot-blocked targets should be clearly flagged and backoff scheduled.
