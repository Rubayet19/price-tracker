import { NextResponse, NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/libs/auth";
import { createCheckout } from "@/libs/stripe";
import connectMongo from "@/libs/mongoose";
import User from "@/models/User";
import config from "@/config";

const ALLOWED_ORIGINS = [
  `https://${config.domainName}`,
  ...(process.env.NODE_ENV === "development" ? ["http://localhost:3000", "http://localhost:3001"] : []),
];

const isAllowedOrigin = (url: string): boolean => {
  return ALLOWED_ORIGINS.some((origin) => url.startsWith(origin + "/") || url === origin);
};

const checkoutRequestSchema = z.object({
  priceId: z.string().trim().min(1),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  mode: z.enum(["payment", "subscription"]),
});

// This function is used to create a Stripe Checkout Session (one-time payment or subscription)
// It's called by the <ButtonCheckout /> component
// By default, it doesn't force users to be authenticated. But if they are, it will prefill the Checkout data with their email and/or credit card
export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid checkout payload" }, { status: 400 });
  }

  if (!config.stripe.plans.some((plan) => plan.priceId === parsed.data.priceId)) {
    return NextResponse.json({ error: "Unknown Stripe priceId" }, { status: 400 });
  }

  if (!isAllowedOrigin(parsed.data.successUrl) || !isAllowedOrigin(parsed.data.cancelUrl)) {
    return NextResponse.json({ error: "Invalid redirect URL" }, { status: 400 });
  }

  try {
    const session = await auth();

    await connectMongo();

    const { priceId, mode, successUrl, cancelUrl } = parsed.data;
    
    let user = null;
    if (session?.user?.id) {
      const { id } = session.user;
      user = await User.findById(String(id));
    }

    const stripeSessionURL = await createCheckout({
      priceId,
      mode,
      successUrl,
      cancelUrl,
      // If user is logged in, it will pass the user ID to the Stripe Session so it can be retrieved in the webhook later
      clientReferenceId: user?._id?.toString(),
      // If user is logged in, this will automatically prefill Checkout data like email and/or credit card for faster checkout
      user,
      // If you send coupons from the frontend, you can pass it here
      // couponId: body.couponId,
    });

    return NextResponse.json({ url: stripeSessionURL });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
