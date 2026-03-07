# CLAUDE.md

## Required Skills

Invoke `/vercel-react-best-practices` for any Next.js, React, App Router, server/client component, data fetching, routing, rendering, metadata, performance, or bundling work.
Invoke `/stripe-best-practices` for any Stripe integration, payment, billing, or webhook work.

## Commands

```bash
npm run dev              # Start local dev server
npm run build            # Production build (runs next-sitemap postbuild)
npm run lint             # ESLint
npm run smoke:dashboard  # End-to-end smoke tests via Playwright
```

No unit test framework — only smoke tests in `scripts/smoke-dashboard.mjs`.

## Architecture

Competitor pricing intelligence SaaS: Next.js 15 App Router, MongoDB/Mongoose, NextAuth v5, Stripe, Resend (email), OpenAI, Sentry (error monitoring). Deployed on Vercel Hobby.

**Directory layout:**

- `app/` — Routes and API handlers
- `components/` — UI (feature-grouped: `dashboard/`, `dashboard/setup/`, `landing/`)
- `libs/` — Services (crawler pipeline, auth, entitlements, stripe, llm, resend)
- `models/` — Mongoose models
- `types/` — Shared TypeScript types
- `config.ts` — Plan tiers, pricing constants, Stripe price IDs, entitlements — **never hardcode these**

## Key Models

| Model                | Purpose                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `User`               | Auth + Stripe state (`customerId`, `priceId`, `hasAccess`, `trialStatus`, `trialStartedAt`, `trialEndsAt`)    |
| `Company`            | Self or competitor with crawl scheduling (`nextCrawlAt`, `crawlLeaseUntil`, `lastCrawlStatus`, `contentHash`) |
| `Snapshot`           | Pricing payload with `captureMethod`, `confidence`, `isVerified`                                              |
| `Diff`               | Snapshot diff with `severity`, `verificationState`, `planChanges`                                             |
| `Insight`            | LLM recommendation (summary, strategic options, thingsToCheck, watchOutFor, watchList) gated by severity      |
| `SelfPricingProfile` | User's manually entered pricing                                                                               |

## Entitlements

`libs/entitlements.ts` is the single source of truth. Access is either:

- **Trial** (`trialStatus: active`, not expired) → Starter limits
- **Paid** (`hasAccess: true`) → tier from `priceId` mapping in `config.ts`

Enforce server-side. Never rely on client-side checks for plan limits.
Plan tiers and limits are defined in `config.ts` — do not duplicate them elsewhere.

## Engineering Rules

- Strict TypeScript with explicit types; prefer `interface`; use `import type` where appropriate.
- Server components by default; `"use client"` only when required.
- Connect MongoDB before DB ops (`libs/mongoose.ts`).
- Validate all API input; consistent JSON responses; proper HTTP status codes.
- Never skip Stripe webhook signature verification (`libs/stripe.ts`).
- `libs/audit-events.ts` for user action logging.
- `libs/cron-auth.ts` + `CRON_SECRET` to protect cron endpoints.
- `libs/cron-lock.ts` for distributed locking (prevent duplicate cron runs).
- Static-first crawling; Playwright only when JS rendering needed, under per-run cap.
- Low-confidence extractions must not produce verified diffs or insights.
- Sentry is configured via `@sentry/nextjs` — config files: `instrumentation-client.ts` (client), `sentry.server.config.ts` (server), `sentry.edge.config.ts` (edge), `instrumentation.ts` (registration hook), `app/global-error.tsx` (React error boundary). `next.config.js` is wrapped with `withSentryConfig()`. Tunnel route at `/monitoring` proxies events to bypass ad blockers.

## MCP Servers

- **MongoDB MCP** is available in this project. Use it to query, inspect, and debug MongoDB collections directly instead of writing throwaway scripts or API routes. Useful for verifying data state, checking user records, debugging crawl results, and validating webhook-written fields.
- **Stripe MCP** is available in this project. Use it to inspect Stripe resources (customers, subscriptions, invoices, products, prices), debug webhook issues, verify billing state, and search Stripe documentation directly.

## Environment Variables

Required for production: `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_ID`, `GOOGLE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.

## Current Status

Product is functionally complete. Remaining work is launch hardening, deployment validation, and polish.

## Current Priority Queue

- Validate production environment values before deployment.
- Run a final manual QA pass on main product flows: sign-in, setup, add competitor, billing/settings, crawl retry, and dashboard empty/error states.
- Confirm Stripe live-mode configuration matches `config.ts` plan mapping and billing portal is enabled.
- Pass user's own pricing (SelfPricingProfile) to the LLM for more contextual competitor-vs-self insights.
