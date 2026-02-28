import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/libs/auth";
import connectMongo from "@/libs/mongoose";
import { createCustomerPortal } from "@/libs/stripe";
import User from "@/models/User";

const portalRequestSchema = z.object({
  returnUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
  const session = await auth();

  if (session) {
    try {
      await connectMongo();

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
      }

      const parsed = portalRequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: "Valid returnUrl is required" }, { status: 400 });
      }

      const { id } = session.user;

      const user = id ? await User.findById(String(id)) : null;

      if (!user?.customerId) {
        return NextResponse.json(
          {
            error:
              "You don't have a billing account yet. Make a purchase first.",
          },
          { status: 400 }
        );
      }

      const stripePortalUrl = await createCustomerPortal({
        customerId: user.customerId,
        returnUrl: parsed.data.returnUrl,
      });

      return NextResponse.json({
        url: stripePortalUrl,
      });
    } catch (error) {
      console.error(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create billing portal session" },
        { status: 500 }
      );
    }
  } else {
    // Not Signed in
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
}
