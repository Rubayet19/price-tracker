# Project Agent Instructions

## Required Context
Always read `PROJECT_CONTEXT.md` before implementing features, pricing logic, onboarding, crawler behavior, dashboard behavior, or marketing-related changes.
Treat `PROJECT_CONTEXT.md` as the product source of truth for goals, constraints, scope, and tradeoffs.
If there is a conflict between implementation assumptions and `PROJECT_CONTEXT.md`, follow `PROJECT_CONTEXT.md` and call out the conflict.

## Required Skills
Always use these two skills in this repository:
- `next-best-practices`
- `vercel-react-best-practices`

Apply both skills for any Next.js, React, App Router, server/client component, data fetching, routing, rendering, metadata, performance, or bundling work.
If guidance conflicts, prefer the stricter performance/correctness path and document the tradeoff in the implementation notes.

## Project Overview
This is a Next.js TypeScript SaaS app with Stripe payments, NextAuth authentication, MongoDB, and Tailwind/DaisyUI UI components.

## Stack
- Next.js App Router
- TypeScript (strict)
- MongoDB + Mongoose
- NextAuth
- Stripe + webhooks
- TailwindCSS + DaisyUI
- Resend (transactional email)

## Engineering Rules
- Use strict TypeScript with explicit types.
- Prefer interfaces for object-shaped contracts.
- Use `import type` where appropriate.
- Keep server components as default; add `"use client"` only when required.
- Keep components focused and single-purpose.
- Use repo structure: `app/` for routes and API handlers.
- Use repo structure: `components/` for UI components.
- Use repo structure: `libs/` for utilities/services.
- Use repo structure: `models/` for Mongoose models.
- Use repo structure: `types/` for shared types.
- Put config values in `config.ts`; do not hardcode plan or pricing constants.

## API and Data Rules
- Validate all request input.
- Use consistent JSON responses and proper status codes.
- Use try/catch with clear error paths.
- Connect MongoDB before DB operations.
- Enforce auth/entitlements server-side.

## Payments and Access Rules
- Verify Stripe webhook signatures.
- Keep subscription state (`priceId`, paid access) synchronized from webhook events.
- Centralize trial/plan limits in one entitlements helper.

## UI and UX Rules
- Use DaisyUI/Tailwind utility patterns already in the codebase.
- Keep loading, error, and empty states explicit.
- Use semantic HTML and accessibility attributes.
- Keep dashboard trust cues visible for scraped data (checked time, confidence, verification state).

## Security and Reliability Rules
- Validate and sanitize external input.
- Never skip webhook verification.
- Add conservative fallback behavior for crawler failures.
- Prefer low-noise diffs and confidence gating over aggressive automation.

## Performance Rules
- Use static-first crawling and hash gating before expensive extraction.
- Keep cron jobs batch-based and short-running.
- Use limited Playwright fallback only when needed.

## Do Not
- Do not use `any` unless unavoidable and justified.
- Do not bypass strict typing or input validation.
- Do not hardcode environment-specific secrets or constants.
- Do not run expensive crawl/extraction steps when hashes are unchanged.
