import { NextResponse } from "next/server";
import client from "@/libs/mongo";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
  };

  try {
    const db = client.db();
    await db.command({ ping: 1 });
    checks.mongodb = "connected";
  } catch {
    checks.status = "degraded";
    checks.mongodb = "error";
  }

  const statusCode = checks.status === "ok" ? 200 : 503;
  return NextResponse.json(checks, { status: statusCode });
}
