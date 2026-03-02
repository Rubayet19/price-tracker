import { NextResponse } from "next/server";
import { Types } from "mongoose";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/auth";
import { logAuditEvent } from "@/libs/audit";
import { createAuditEventSafe } from "@/libs/audit-events";
import { enforceWriteRateLimit } from "@/libs/rate-limit";
import Company from "@/models/Company";
import Diff from "@/models/Diff";
import Insight from "@/models/Insight";
import Snapshot from "@/models/Snapshot";

interface RouteContext {
  params: Promise<{
    companyId: string;
  }>;
}

export async function DELETE(_: Request, context: RouteContext): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { companyId } = await context.params;
  if (!Types.ObjectId.isValid(companyId)) {
    return NextResponse.json({ error: "Invalid companyId" }, { status: 400 });
  }

  try {
    await connectMongo();
    const rateLimit = await enforceWriteRateLimit({
      key: `write:company-delete:${userId}`,
      maxRequests: 10,
      windowMs: 60 * 1000,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many delete requests",
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

    const company = await Company.findOne({
      _id: companyId,
      userId: String(userId),
    });

    if (!company) {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.delete",
        resourceType: "company",
        resourceId: companyId,
        status: "failure",
        metadata: {
          reason: "company_not_found",
        },
      });

      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (company.type !== "competitor") {
      await logAuditEvent({
        userId: String(userId),
        actorType: "user",
        action: "company.delete",
        resourceType: "company",
        resourceId: String(company.id),
        status: "rejected",
        metadata: {
          reason: "non_competitor_delete_not_allowed",
          companyType: company.type,
        },
      });

      return NextResponse.json(
        { error: "Only competitors can be deleted from this action" },
        { status: 400 }
      );
    }

    const [deletedSnapshots, deletedDiffs, deletedInsights] = await Promise.all([
      Snapshot.deleteMany({ userId: company.userId, companyId: company._id }),
      Diff.deleteMany({ userId: company.userId, companyId: company._id }),
      Insight.deleteMany({ userId: company.userId, companyId: company._id }),
    ]);

    await Company.deleteOne({ _id: company._id, userId: company.userId });

    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.delete",
      resourceType: "company",
      resourceId: String(company.id),
      status: "success",
      metadata: {
        companyType: company.type,
        domain: company.domain,
        snapshotCount: deletedSnapshots.deletedCount,
        diffCount: deletedDiffs.deletedCount,
        insightCount: deletedInsights.deletedCount,
      },
    });
    await createAuditEventSafe({
      eventType: "company_deleted",
      source: "api:companies.[companyId].delete",
      userId: String(userId),
      companyId: String(company.id),
      metadata: {
        companyType: company.type,
        domain: company.domain,
        snapshotCount: deletedSnapshots.deletedCount,
        diffCount: deletedDiffs.deletedCount,
        insightCount: deletedInsights.deletedCount,
      },
    });

    return NextResponse.json({
      companyId: String(company.id),
      deleted: true,
    });
  } catch (error) {
    console.error(error);
    await logAuditEvent({
      userId: String(userId),
      actorType: "user",
      action: "company.delete",
      resourceType: "company",
      resourceId: companyId,
      status: "failure",
      metadata: {
        reason: error instanceof Error ? error.message : "unknown_error",
      },
    });

    return NextResponse.json({ error: "Failed to delete competitor" }, { status: 500 });
  }
}
