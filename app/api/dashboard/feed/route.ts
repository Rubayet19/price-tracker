import { NextRequest, NextResponse } from "next/server";
import { type PipelineStage, Types } from "mongoose";
import { z } from "zod";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import DiffModel, { type DiffSeverity, type DiffVerificationState } from "@/models/Diff";
import type { InsightSeverityGate } from "@/models/Insight";

const feedQuerySchema = z.object({
  severity: z.enum(["low", "medium", "high"]).optional(),
  verificationState: z.enum(["verified", "unverified"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().optional(),
});

interface FeedQuery {
  severity?: DiffSeverity;
  verificationState?: DiffVerificationState;
  limit: number;
  cursor?: string;
}

interface DashboardFeedRowRaw {
  _id: Types.ObjectId;
  severity: DiffSeverity;
  verificationState: DiffVerificationState;
  detectedAt: Date;
  normalizedDiff: Record<string, unknown>;
  company: {
    _id: Types.ObjectId;
    name: string;
    domain: string;
    type: "self" | "competitor";
    lastCrawlAt?: Date;
    lastCrawlStatus: "idle" | "ok" | "blocked" | "manual_needed" | "error";
    latestConfidence?: number;
  };
  latestInsight?: {
    _id: Types.ObjectId;
    generatedAt: Date;
    severityGate: InsightSeverityGate;
    recommendation: Record<string, unknown>;
  } | null;
}

interface ParsedCursor {
  detectedAt: Date;
  id: Types.ObjectId | null;
}

const encodeCursor = (detectedAt: Date, id: Types.ObjectId): string => {
  const payload = JSON.stringify({ detectedAt: detectedAt.toISOString(), id: id.toString() });
  return Buffer.from(payload, "utf8").toString("base64url");
};

const parseCursor = (cursor: string): ParsedCursor | null => {
  const trimmed = cursor.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as { detectedAt?: unknown; id?: unknown };

    if (typeof parsed.detectedAt !== "string" || typeof parsed.id !== "string") {
      return null;
    }

    const detectedAt = new Date(parsed.detectedAt);
    if (Number.isNaN(detectedAt.getTime())) {
      return null;
    }

    if (!Types.ObjectId.isValid(parsed.id)) {
      return null;
    }

    return { detectedAt, id: new Types.ObjectId(parsed.id) };
  } catch {
    // legacy cursor: ISO datetime
    const detectedAt = new Date(trimmed);
    if (Number.isNaN(detectedAt.getTime())) {
      return null;
    }

    return { detectedAt, id: null };
  }
};

const parseQuery = (request: NextRequest): { success: true; data: FeedQuery } | {
  success: false;
  response: NextResponse;
} => {
  const { searchParams } = new URL(request.url);

  const parsed = feedQuerySchema.safeParse({
    severity: searchParams.get("severity") ?? undefined,
    verificationState: searchParams.get("verificationState") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      response: NextResponse.json(
        { error: "Invalid query params", issues: parsed.error.flatten() },
        { status: 400 }
      ),
    };
  }

  return { success: true, data: parsed.data };
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const queryResult = parseQuery(request);
  if (queryResult.success === false) {
    return queryResult.response;
  }

  const { severity, verificationState, limit, cursor } = queryResult.data;

  const parsedCursor = cursor ? parseCursor(cursor) : null;
  if (cursor && !parsedCursor) {
    return NextResponse.json(
      { error: "Invalid cursor. Use the cursor value returned by this endpoint." },
      { status: 400 }
    );
  }

  try {
    await connectMongo();

    const userObjectId = new Types.ObjectId(String(userId));
    const matchStage: Record<string, unknown> = {
      userId: userObjectId,
    };

    if (severity) {
      matchStage.severity = severity;
    }

    if (verificationState) {
      matchStage.verificationState = verificationState;
    }

    if (parsedCursor) {
      if (parsedCursor.id) {
        matchStage.$or = [
          { detectedAt: { $lt: parsedCursor.detectedAt } },
          { detectedAt: parsedCursor.detectedAt, _id: { $lt: parsedCursor.id } },
        ];
      } else {
        matchStage.detectedAt = { $lt: parsedCursor.detectedAt };
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: matchStage },
      { $sort: { detectedAt: -1, _id: -1 } },
      { $limit: limit + 1 },
      {
        $lookup: {
          from: "companies",
          localField: "companyId",
          foreignField: "_id",
          as: "company",
        },
      },
      {
        $unwind: {
          path: "$company",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $match: {
          "company.userId": userObjectId,
        },
      },
      {
        $lookup: {
          from: "insights",
          let: { diffId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$diffId", "$$diffId"] },
              },
            },
            { $sort: { generatedAt: -1 } },
            { $limit: 1 },
            {
              $project: {
                _id: 1,
                generatedAt: 1,
                severityGate: 1,
                recommendation: 1,
              },
            },
          ],
          as: "latestInsight",
        },
      },
      {
        $addFields: {
          latestInsight: { $arrayElemAt: ["$latestInsight", 0] },
        },
      },
      {
        $project: {
          _id: 1,
          severity: 1,
          verificationState: 1,
          detectedAt: 1,
          normalizedDiff: 1,
          company: {
            _id: "$company._id",
            name: "$company.name",
            domain: "$company.domain",
            type: "$company.type",
            lastCrawlAt: "$company.lastCrawlAt",
            lastCrawlStatus: "$company.lastCrawlStatus",
            latestConfidence: "$company.latestConfidence",
          },
          latestInsight: 1,
        },
      },
    ];

    const rows = await DiffModel.aggregate<DashboardFeedRowRaw>(pipeline).exec();
    const hasMore = rows.length > limit;
    const selectedRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && selectedRows.length > 0
        ? encodeCursor(
            selectedRows[selectedRows.length - 1].detectedAt,
            selectedRows[selectedRows.length - 1]._id
          )
        : null;

    return NextResponse.json({
      rows: selectedRows.map((row) => ({
        diffId: row._id.toString(),
        severity: row.severity,
        verificationState: row.verificationState,
        detectedAt: row.detectedAt,
        normalizedDiff: row.normalizedDiff,
        company: {
          companyId: row.company._id.toString(),
          name: row.company.name,
          domain: row.company.domain,
          type: row.company.type,
          lastCrawlStatus: row.company.lastCrawlStatus,
          lastCrawlAt: row.company.lastCrawlAt ?? null,
          latestConfidence: row.company.latestConfidence ?? null,
        },
        latestInsight: row.latestInsight
          ? {
              insightId: row.latestInsight._id.toString(),
              generatedAt: row.latestInsight.generatedAt,
              severityGate: row.latestInsight.severityGate,
              recommendation: row.latestInsight.recommendation,
            }
          : null,
        trustCues: {
          detectedAt: row.detectedAt,
          verificationState: row.verificationState,
          companyLastCrawlAt: row.company.lastCrawlAt ?? null,
          latestConfidence: row.company.latestConfidence ?? null,
        },
      })),
      pageInfo: {
        limit,
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load dashboard feed" }, { status: 500 });
  }
}
