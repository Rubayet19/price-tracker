import { NextResponse } from "next/server";
import connectMongo from "@/libs/mongoose";
import { auth } from "@/libs/next-auth";
import { isTrialActive, resolveEntitlements } from "@/libs/entitlements";
import { refreshTrialStatusIfExpired } from "@/libs/trial";
import User from "@/models/User";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    await connectMongo();

    const user = await User.findById(String(userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const now = new Date();
    await refreshTrialStatusIfExpired(user, now);
    const entitlements = resolveEntitlements(user, now);

    return NextResponse.json({
      entitlements,
      trial: {
        status: user.trialStatus,
        startedAt: user.trialStartedAt,
        endsAt: user.trialEndsAt,
        isActive: isTrialActive(user, now),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to load entitlements" }, { status: 500 });
  }
}
