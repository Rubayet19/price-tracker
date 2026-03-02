import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit";
import { normalizeSelfPricingProfile } from "@/libs/self-pricing";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import SelfPricingProfile from "@/models/SelfPricingProfile";

const MAX_PLAN_PRICE = 1_000_000;
const MAX_PLANS = 20;

const planSchema = z
  .object({
  name: z.string().trim().min(1).max(120),
    monthlyPrice: z.number().finite().min(0).max(MAX_PLAN_PRICE).nullable().optional(),
    annualPrice: z.number().finite().min(0).max(MAX_PLAN_PRICE).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.monthlyPrice == null && value.annualPrice == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Each plan needs at least a monthly or annual price",
        path: ["monthlyPrice"],
      });
    }
  });

const selfPricingProfileSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  plans: z.array(planSchema).min(1).max(MAX_PLANS),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();

    const profile = await SelfPricingProfile.findOne({ userId: String(userId) });
    return NextResponse.json({ profile: normalizeSelfPricingProfile(profile?.toObject() ?? null) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load self pricing profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  await connectMongo();
  const rateLimit = await enforceWriteRateLimit({
    key: `write:self-pricing-put:${userId}`,
    maxRequests: 12,
    windowMs: 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many self-pricing updates",
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = selfPricingProfileSchema.safeParse(body);
  if (!parsed.success) {
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "self_pricing.upsert",
      resourceType: "self_pricing_profile",
      status: "rejected",
      metadata: {
        reason: "invalid_request_body",
      },
    });
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const normalizedPayload = {
    currency: parsed.data.currency,
    plans: parsed.data.plans.map((plan) => ({
      name: plan.name,
      monthlyPrice: plan.monthlyPrice ?? null,
      annualPrice: plan.annualPrice ?? null,
    })),
    notes: parsed.data.notes,
  };

  try {
    const profile = await SelfPricingProfile.findOneAndUpdate(
      { userId: String(userId) },
      { $set: normalizedPayload },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "self_pricing.upsert",
      resourceType: "self_pricing_profile",
      resourceId: profile?.id ? String(profile.id) : undefined,
      status: "success",
      metadata: {
        currency: normalizedPayload.currency,
        planCount: normalizedPayload.plans.length,
      },
    });

    return NextResponse.json({ profile: normalizeSelfPricingProfile(profile?.toObject() ?? null) });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "self_pricing.upsert",
      resourceType: "self_pricing_profile",
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Failed to save self pricing profile" }, { status: 500 });
  }
}
