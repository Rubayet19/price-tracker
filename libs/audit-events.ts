import { Types } from "mongoose";
import { logAuditEvent } from "@/libs/audit";

export type LifecycleAuditEventType =
  | "trial_started"
  | "trial_start_blocked"
  | "company_created"
  | "competitor_cap_hit"
  | "primary_pricing_url_changed"
  | "webhook_access_granted"
  | "webhook_access_revoked"
  | "crawl_blocked"
  | "crawl_manual_needed"
  | "crawl_error";

interface LifecycleAuditEventInput {
  eventType: LifecycleAuditEventType;
  userId?: string | Types.ObjectId | null;
  companyId?: string | Types.ObjectId | null;
  source?: string;
  metadata?: Record<string, unknown>;
}

const EVENT_TO_STATUS: Record<LifecycleAuditEventType, "success" | "rejected"> = {
  trial_started: "success",
  trial_start_blocked: "rejected",
  company_created: "success",
  competitor_cap_hit: "rejected",
  primary_pricing_url_changed: "success",
  webhook_access_granted: "success",
  webhook_access_revoked: "success",
  crawl_blocked: "rejected",
  crawl_manual_needed: "rejected",
  crawl_error: "rejected",
};

const EVENT_TO_ACTOR: Record<
  LifecycleAuditEventType,
  "user" | "system" | "stripe_webhook" | "cron"
> = {
  trial_started: "user",
  trial_start_blocked: "user",
  company_created: "user",
  competitor_cap_hit: "user",
  primary_pricing_url_changed: "user",
  webhook_access_granted: "stripe_webhook",
  webhook_access_revoked: "stripe_webhook",
  crawl_blocked: "cron",
  crawl_manual_needed: "cron",
  crawl_error: "cron",
};

const EVENT_TO_RESOURCE: Record<LifecycleAuditEventType, "trial" | "company" | "webhook" | "crawl"> = {
  trial_started: "trial",
  trial_start_blocked: "trial",
  company_created: "company",
  competitor_cap_hit: "company",
  primary_pricing_url_changed: "company",
  webhook_access_granted: "webhook",
  webhook_access_revoked: "webhook",
  crawl_blocked: "crawl",
  crawl_manual_needed: "crawl",
  crawl_error: "crawl",
};

const toResourceId = (
  input: Pick<LifecycleAuditEventInput, "companyId" | "userId">
): string | undefined => {
  if (input.companyId) {
    return String(input.companyId);
  }

  if (input.userId) {
    return String(input.userId);
  }

  return undefined;
};

export const createAuditEventSafe = async (
  input: LifecycleAuditEventInput
): Promise<void> => {
  await logAuditEvent({
    userId: input.userId,
    actorType: EVENT_TO_ACTOR[input.eventType],
    action: input.eventType,
    resourceType: EVENT_TO_RESOURCE[input.eventType],
    resourceId: toResourceId(input),
    status: EVENT_TO_STATUS[input.eventType],
    metadata: {
      source: input.source,
      ...(input.metadata ?? {}),
    },
  });
};
