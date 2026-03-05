import posthog from "posthog-js";

// Product analytics events with typed properties.
// Usage: import { analytics } from "@/libs/analytics"; analytics.competitorAdded({ ... });

export const analytics = {
  // Onboarding
  setupCompleted: () =>
    posthog.capture("setup_completed"),

  selfPricingUpdated: () =>
    posthog.capture("self_pricing_updated"),

  // Competitors
  competitorAdded: (props: { companyId: string; name: string }) =>
    posthog.capture("competitor_added", props),

  competitorRemoved: (props: { companyId: string; name: string }) =>
    posthog.capture("competitor_removed", props),

  // Insights & Diffs
  insightViewed: (props: { diffId: string; severity: string; companyName: string }) =>
    posthog.capture("insight_viewed", props),

  diffViewed: (props: { diffId: string; companyName: string }) =>
    posthog.capture("diff_viewed", props),

  // Billing
  trialStarted: () =>
    posthog.capture("trial_started"),

  planUpgraded: (props: { plan: string; priceId: string }) =>
    posthog.capture("plan_upgraded", props),

  planDowngraded: (props: { plan: string; priceId: string }) =>
    posthog.capture("plan_downgraded", props),

  // Page-specific
  pricingPageViewed: () =>
    posthog.capture("pricing_page_viewed"),
};
