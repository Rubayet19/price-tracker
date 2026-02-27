import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { logAuditEvent } from "@/libs/audit";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import SelfPricingProfile from "@/models/SelfPricingProfile";

const MAX_PLAN_PRICE = 1_000_000;
const MAX_PLANS = 20;
const MAX_HIGHLIGHTS_PER_PLAN = 10;

const planSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.number().finite().min(0).max(MAX_PLAN_PRICE),
  priceAnchor: z.number().finite().min(0).max(MAX_PLAN_PRICE).optional(),
  highlights: z.array(z.string().trim().min(1).max(160)).max(MAX_HIGHLIGHTS_PER_PLAN).optional(),
});

const selfPricingProfileSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  billingPeriod: z.enum(["month", "year", "custom"]).default("month"),
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
    return NextResponse.json({ profile: profile ?? null });
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
    billingPeriod: parsed.data.billingPeriod,
    plans: parsed.data.plans.map((plan) => ({
      name: plan.name,
      price: plan.price,
      priceAnchor: plan.priceAnchor,
      highlights: plan.highlights ?? [],
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
        billingPeriod: normalizedPayload.billingPeriod,
        planCount: normalizedPayload.plans.length,
      },
    });

    return NextResponse.json({ profile });
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
