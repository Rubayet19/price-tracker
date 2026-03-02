# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Required Context

Always read `PROJECT_CONTEXT.md` before implementing features, pricing logic, onboarding, crawler behavior, dashboard behavior, or marketing-related changes. Treat it as the product source of truth. If there is a conflict between implementation assumptions and `PROJECT_CONTEXT.md`, follow `PROJECT_CONTEXT.md` and call out the conflict.

## Required Skills

Always invoke these two skills for any Next.js, React, App Router, server/client component, data fetching, routing, rendering, metadata, performance, or bundling work:
- `/next-best-practices`
- `/vercel-react-best-practices`

If guidance conflicts, prefer the stricter performance/correctness path and document the tradeoff.

## Commands

```bash
npm run dev          # Start local dev server
npm run build        # Production build (runs next-sitemap postbuild)
npm run lint         # ESLint
npm run smoke:dashboard  # End-to-end smoke tests via Playwright
```

No unit test framework — only smoke tests in `scripts/smoke-dashboard.mjs`.

## Architecture Overview

This is a competitor pricing intelligence SaaS built on Next.js 15 App Router, MongoDB/Mongoose, NextAuth v5, Stripe, Resend (email), and OpenAI. Deployed on Vercel Hobby.

**Directory conventions:**
- `app/` — Next.js routes and API handlers
- `components/` — UI components (organized by feature under `components/dashboard/`, `components/dashboard/setup/`, `components/landing/`)
- `libs/` — Utilities and services (crawler pipeline, auth, entitlements, stripe, gpt, resend, etc.)
- `models/` — Mongoose models
- `types/` — Shared TypeScript types
- `config.ts` — All plan tiers, pricing constants, Stripe price IDs, entitlements — **never hardcode these**

## Crawl Pipeline

The core backend loop lives in `libs/crawler/`:

1. `runner.ts` — Lease-based batch claiming (`/api/cron/crawl`, runs every 15 min via `vercel.json`)
2. `extract.ts` — Heuristic extraction → `playwright-extract.ts` fallback → LLM fallback
3. `normalize.ts` — Canonicalize pricing JSON before diffing
4. `diff.ts` — Generate normalized diffs with severity (`low | medium | high`)
5. `insight.ts` — AI recommendations gated by plan severity tier
6. `discovery.ts` — Homepage link scoring for finding pricing URLs

Hash gating: if `contentHash` is unchanged, skip extraction and diff entirely.

## Entitlements

`libs/entitlements.ts` is the single source of truth for access state. Access is either:
- **Trial** (`trialStatus: active` and not expired) → Starter limits
- **Paid** (`hasAccess: true`) → tier from `priceId` mapping in `config.ts`

Enforce entitlements server-side. Never rely on client-side checks for plan limits.

## Key Models

| Model | Purpose |
|-------|---------|
| `User` | Auth + Stripe subscription state (`customerId`, `priceId`, `hasAccess`, `trialStatus`, `trialStartedAt`, `trialEndsAt`) |
| `Company` | Self or competitor record with crawl scheduling fields (`nextCrawlAt`, `crawlLeaseUntil`, `lastCrawlStatus`, `contentHash`) |
| `Snapshot` | Captured pricing payload with `captureMethod`, `confidence`, and `isVerified` |
| `Diff` | Snapshot-to-snapshot diff with `severity` and `verificationState` (`verified | unverified`) |
| `Insight` | AI recommendation from a diff, gated by severity |
| `SelfPricingProfile` | User's manually entered own product pricing |

## Engineering Rules

- Use strict TypeScript with explicit types; prefer `interface` for object contracts; use `import type` where appropriate.
- Keep server components as default; add `"use client"` only when required.
- Connect MongoDB before DB operations (use `libs/mongoose.ts`).
- Validate all API request input; use consistent JSON responses and proper HTTP status codes.
- Never skip Stripe webhook signature verification (`libs/stripe.ts`).
- Use `libs/audit-events.ts` for user action logging.
- Use `libs/cron-auth.ts` to protect cron endpoints with `CRON_SECRET`.
- Use `libs/cron-lock.ts` for distributed locking to prevent duplicate cron runs.
- Static-first crawling; run Playwright only when JS rendering is needed and under per-run cap.
- Low-confidence extractions must not produce verified diffs or insights.

## Plans & Pricing (from `config.ts`)

| Plan | Price | Competitors | Insights |
|------|-------|-------------|---------|
| Starter | $19/mo | 3 | High severity only |
| Pro | $49/mo | 10 | High + Medium severity |
| Trial | Free, 7 days | Starter limits | High only, no digest |

Weekly digest emails go to paying users only (`hasAccess: true`).
