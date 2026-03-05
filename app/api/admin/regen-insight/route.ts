import { NextRequest, NextResponse } from "next/server";
import type { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { requireCronAuth } from "@/libs/cron-auth";
import { buildInsightFromDiff } from "@/libs/crawler/insight";
import DiffModel from "@/models/Diff";
import InsightModel from "@/models/Insight";
import CompanyModel from "@/models/Company";
import UserModel from "@/models/User";

// One-off endpoint to regenerate the latest insight with the updated LLM prompt.
// Protected by CRON_SECRET. Hit with:
//   curl -X POST http://localhost:3000/api/admin/regen-insight \
//     -H "Authorization: Bearer <CRON_SECRET>"

export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  await connectMongo();
  const now = new Date();

  // Find the most recent insight
  const latestInsight = await InsightModel.findOne().sort({ generatedAt: -1 }).lean();
  if (!latestInsight) {
    return NextResponse.json({ error: "No insights found" }, { status: 404 });
  }

  // Load the associated diff
  const diff = await DiffModel.findById(latestInsight.diffId).lean();
  if (!diff) {
    return NextResponse.json({ error: "Diff not found" }, { status: 404 });
  }

  // Load company and user
  const [company, user] = await Promise.all([
    CompanyModel.findById(diff.companyId).lean(),
    UserModel.findById(diff.userId).lean(),
  ]);

  if (!company || !user) {
    return NextResponse.json({ error: "Company or user not found" }, { status: 404 });
  }

  // Delete the old insight
  await InsightModel.deleteOne({ _id: latestInsight._id });

  // Regenerate
  const result = await buildInsightFromDiff({
    user: {
      _id: user._id as Types.ObjectId,
      hasAccess: user.hasAccess,
      priceId: user.priceId ?? null,
      trialStatus: user.trialStatus,
      trialStartedAt: user.trialStartedAt,
      trialEndsAt: user.trialEndsAt,
    },
    companyId: diff.companyId as Types.ObjectId,
    companyName: company.name,
    diffId: diff._id as Types.ObjectId,
    severity: diff.severity,
    verificationState: diff.verificationState,
    normalizedDiff: diff.normalizedDiff,
    now,
  });

  if (!result.shouldCreate || !result.createInput) {
    return NextResponse.json({ error: "Insight generation returned shouldCreate=false", reason: result.reason }, { status: 422 });
  }

  const newInsight = await InsightModel.create(result.createInput);

  return NextResponse.json({
    ok: true,
    model: result.createInput.model,
    insightId: (newInsight._id as Types.ObjectId).toString(),
    recommendation: result.createInput.recommendation,
  });
}
