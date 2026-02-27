import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { logAuditEvent } from "@/libs/audit";
import { createAuditEventSafe } from "@/libs/audit-events";
import { resolveEntitlements } from "@/libs/entitlements";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import { startTrialForUser } from "@/libs/trial";
import User from "@/models/User";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:trial-start:${userId}`,
      maxRequests: 3,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many trial start attempts",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    const now = new Date();
    const trialResult = await startTrialForUser(String(userId), now);
    const user = await User.findById(String(userId));

    if (!user) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "trial.start",
        resourceType: "trial",
        status: "failure",
        metadata: {
          reason: "user_not_found_after_trial_attempt",
        },
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const entitlements = resolveEntitlements(user, now);

    const status = trialResult.started ? 200 : 409;
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "trial.start",
      resourceType: "trial",
      status: trialResult.started ? "success" : "rejected",
      metadata: {
        reason: trialResult.reason,
        trialStatus: trialResult.trialStatus,
        started: trialResult.started,
      },
    });
    await createAuditEventSafe({
      eventType: trialResult.started ? "trial_started" : "trial_start_blocked",
      source: "api:trial.start",
      userId: String(userId),
      metadata: {
        reason: trialResult.reason,
        trialStatus: trialResult.trialStatus,
        started: trialResult.started,
      },
    });

    return NextResponse.json(
      {
        trial: trialResult,
        entitlements,
      },
      { status }
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("User not found:")) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "trial.start",
        resourceType: "trial",
        status: "failure",
        metadata: {
          reason: "user_not_found",
        },
      });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "trial.start",
      resourceType: "trial",
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Failed to start trial" }, { status: 500 });
  }
}
