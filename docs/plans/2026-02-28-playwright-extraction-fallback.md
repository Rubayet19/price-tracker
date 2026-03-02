# Playwright Extraction Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a bounded Playwright fallback for interactive pricing pages so monthly/yearly toggles and rendered plan cards are extracted more accurately than the current static-only heuristics.

**Architecture:** Keep discovery and default extraction static-first. After a static pass, escalate to a Playwright-based renderer only when the page appears interactive or the static result is structurally weak. Prefer the Playwright result only when it improves structural extraction quality and keep confidence conservative when cadence states or plan-card structure remain ambiguous.

**Tech Stack:** Next.js server runtime, TypeScript, existing crawler pipeline in `libs/crawler/*`, Playwright, existing smoke script.

---

### Task 1: Add fallback thresholds and runtime helpers

**Files:**
- Modify: `/Users/rubayet/Code/SaaS/price-tracker/libs/crawler/constants.ts`
- Create: `/Users/rubayet/Code/SaaS/price-tracker/libs/crawler/playwright-extract.ts`

**Step 1: Add bounded Playwright constants**
- Add extraction timeout and toggle settle timeout constants.
- Add confidence/fallback thresholds so the renderer only runs when warranted.

**Step 2: Add a Playwright renderer helper**
- Create a server-side helper that:
  - opens the pricing page
  - detects visible monthly/yearly controls using resilient text/role matching
  - clicks each cadence state when present
  - extracts visible pricing-card text per state

**Step 3: Keep runtime defensive**
- Use dynamic import for Playwright.
- Catch renderer failures and return a structured fallback failure instead of crashing the crawl.

### Task 2: Extract structural pricing data from rendered cards

**Files:**
- Modify: `/Users/rubayet/Code/SaaS/price-tracker/libs/crawler/playwright-extract.ts`
- Modify: `/Users/rubayet/Code/SaaS/price-tracker/libs/crawler/extract.ts`

**Step 1: Extract card-level data**
- For rendered pages, identify repeated visible card containers and read:
  - candidate plan name
  - visible numeric prices
  - cadence hints near the price

**Step 2: Normalize monthly and annual states**
- When the page has a cadence toggle:
  - extract monthly state
  - extract annual/yearly state
- Assign price period from the active cadence when price text itself is ambiguous.

**Step 3: Reject obvious garbage**
- Ignore non-price large numbers and unrelated metrics.
- Ignore custom/contact-sales-only rows for structured price points.

### Task 3: Tighten confidence scoring and fallback selection

**Files:**
- Modify: `/Users/rubayet/Code/SaaS/price-tracker/libs/crawler/extract.ts`

**Step 1: Replace price-count-only confidence**
- Score based on structure:
  - repeated plan-card evidence
  - extracted plan names
  - price adjacency to plan cards
  - cadence-state success

**Step 2: Escalate sooner**
- Trigger Playwright when:
  - page contains monthly/yearly signals
  - static extraction found prices but no credible plan names
  - static result contains implausible price ranges
  - static confidence is below threshold

**Step 3: Prefer the better result**
- Keep the static result if it is already strong and consistent.
- Prefer the Playwright result when it has better structure and cadence coverage.

### Task 4: Verify on the existing dashboard flow

**Files:**
- Modify: `/Users/rubayet/Code/SaaS/price-tracker/scripts/smoke-dashboard.mjs` (only if needed)

**Step 1: Build the app**
- Run `NEXT_DISABLE_WEBPACK_CACHE=1 npm run build`

**Step 2: Run the existing smoke path**
- Run `PORT=3008 SMOKE_BASE_URL=http://localtest.me:3008 npm run smoke:dashboard`

**Step 3: Manual sanity-check guidance**
- Re-crawl a known interactive pricing page (for example ClickUp-like monthly/yearly toggle pages) and confirm:
  - monthly prices detected
  - annual prices detected after toggle
  - confidence is not marked high when extraction is incomplete

