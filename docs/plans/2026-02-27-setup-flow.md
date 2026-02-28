# Setup Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the authenticated setup flow under `/dashboard/setup`, redirect incomplete users there, and wire self pricing, trial start, competitor creation, and pricing URL selection to the existing APIs.

**Architecture:** Keep Option A: reuse the current dashboard chrome and add setup-specific pages/components under `/dashboard/setup/*`. Add one server-side setup status helper that reads Mongo models directly and drives redirects for `/dashboard` and `/dashboard/setup`. Use client components only for step forms and mutations.

**Tech Stack:** Next.js App Router, React client/server components, TypeScript, Mongoose, NextAuth, shadcn/ui, Tailwind, react-hot-toast.

---

### Task 1: Add server-side setup status helper

**Files:**
- Create: `libs/setup.ts`
- Read: `models/SelfPricingProfile.ts`
- Read: `models/Company.ts`
- Read: `models/User.ts`
- Read: `libs/entitlements.ts`
- Read: `libs/trial.ts`

**Steps:**
1. Add `getSetupStatus(userId)` that loads user, self pricing profile, self company, competitor companies, and trial state in parallel.
2. Return booleans and counts for: `hasSelfPricing`, `hasSelfCompany`, `hasCompetitors`, `hasSelectedPrimaryPricing`, `canStartTrial`, `needsTrialAccess`, `nextStep`, and the resolved entitlements/trial snapshot.
3. Keep helper server-only and DB-backed rather than calling HTTP APIs.

### Task 2: Redirect incomplete users

**Files:**
- Modify: `app/dashboard/page.tsx`
- Create: `app/dashboard/setup/page.tsx`
- Possibly modify: `app/dashboard/layout.tsx`

**Steps:**
1. Make `/dashboard` a server component that checks `getSetupStatus()`.
2. Redirect incomplete users to `/dashboard/setup`.
3. Make `/dashboard/setup` redirect to the next incomplete step.

### Task 3: Add shared setup UI/types/api helpers

**Files:**
- Create: `types/setup.ts`
- Create: `components/dashboard/setup/setup-api.ts`
- Create: `components/dashboard/setup/setup-shell.tsx`
- Create: `components/dashboard/setup/setup-progress.tsx`

**Steps:**
1. Define explicit setup view models and API payload types.
2. Add small front-end fetch helpers for entitlements, self pricing, companies, trial start, discovery, and primary pricing selection.
3. Build a reusable setup shell with a progress/checklist card that fits current dashboard styling.

### Task 4: Build self-pricing step

**Files:**
- Create: `app/dashboard/setup/self-pricing/page.tsx`
- Create: `components/dashboard/setup/self-pricing-step.tsx`

**Steps:**
1. Load existing self pricing server-side or client-side on mount.
2. Provide a focused form for currency, billing period, plans, and notes.
3. Validate inline, save via `PUT /api/self-pricing`, then advance.

### Task 5: Build trial step

**Files:**
- Create: `app/dashboard/setup/trial/page.tsx`
- Create: `components/dashboard/setup/trial-step.tsx`

**Steps:**
1. Explain why trial is required for competitor tracking.
2. Show current entitlement/trial state.
3. Call `POST /api/trial/start`, handle `409/429`, refresh state, and advance when access becomes active.

### Task 6: Build competitor creation step

**Files:**
- Create: `app/dashboard/setup/competitors/page.tsx`
- Create: `components/dashboard/setup/competitor-step.tsx`

**Steps:**
1. Show remaining competitor capacity from entitlements.
2. Let user add a competitor inline with the same validation expectations as the API.
3. List existing competitors and route the user to the pricing-selection step for the next incomplete competitor.

### Task 7: Build pricing discovery/selection step

**Files:**
- Create: `app/dashboard/setup/competitors/[companyId]/pricing/page.tsx`
- Create: `components/dashboard/setup/competitor-pricing-step.tsx`

**Steps:**
1. Load the target competitor and existing candidates.
2. Support “Discover pricing URLs” and surface returned candidates/recommended URL.
3. Allow selecting a candidate or entering a manual URL override.
4. Save via `PATCH /api/companies/[companyId]/primary-pricing`, then return to the next setup step or dashboard.

### Task 8: Hook dashboard chrome into setup state

**Files:**
- Modify: `components/app-sidebar.tsx`
- Possibly modify: `components/site-header.tsx`

**Steps:**
1. Add a relevant setup navigation entry while setup is incomplete, or ensure `/dashboard/setup` is reachable.
2. Keep Add Competitor available globally, but do not let it replace the guided setup flow.

### Task 9: Validate build and redirects

**Files:**
- No code changes unless fixes are required.

**Steps:**
1. Run a production build.
2. Run a dev-server smoke check for `/dashboard` redirect behavior.
3. Confirm setup pages compile and auth-protected routes still work.

