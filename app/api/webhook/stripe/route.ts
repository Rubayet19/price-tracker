import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import connectMongo from "@/libs/mongoose";
import config from "@/config";
import User from "@/models/User";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { findCheckoutSession } from "@/libs/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TrialStatus = "not_started" | "active" | "expired" | "converted";

interface MutableUserDocument {
  _id: unknown;
  email?: string;
  customerId?: string;
  priceId?: string;
  hasAccess: boolean;
  trialStatus: TrialStatus;
  save: () => Promise<unknown>;
}

type StripeEventClaimResult =
  | { ok: true; action: "process"; attempt: number }
  | { ok: true; action: "skip"; reason: "already_processed" | "in_progress" }
  | { ok: false; error: string };

const ACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "active",
  "trialing",
  "past_due",
]);
const INACTIVE_SUBSCRIPTION_STATUSES = new Set<Stripe.Subscription.Status>([
  "canceled",
  "incomplete_expired",
  "unpaid",
]);

const STRIPE_EVENT_LOCK_MS = 5 * 60 * 1000;

const getStripeConfig = (): { stripe: Stripe; webhookSecret: string } | null => {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripeSecretKey || !webhookSecret) {
    return null;
  }

  return {
    stripe: new Stripe(stripeSecretKey, {
      apiVersion: "2023-08-16",
      typescript: true,
    }),
    webhookSecret,
  };
};

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Stripe webhook error";
};

const isDuplicateKeyError = (error: unknown): boolean => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 11000;
};

const isKnownPriceId = (priceId: string): boolean => {
  return config.stripe.plans.some((plan) => plan.priceId === priceId);
};

const resolveKnownPriceId = (priceId: string | null): string | null => {
  if (!priceId) {
    return null;
  }

  return isKnownPriceId(priceId) ? priceId : null;
};

const getInvoicePriceId = (invoice: Stripe.Invoice): string | null => {
  return invoice.lines.data[0]?.price?.id ?? null;
};

const getSubscriptionPriceId = (subscription: Stripe.Subscription): string | null => {
  return subscription.items.data[0]?.price?.id ?? null;
};

const hasActiveSubscriptionAccess = (status: Stripe.Subscription.Status): boolean => {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
};

const updateUserToPaidAccess = (
  user: MutableUserDocument,
  options: { customerId?: string | null; priceId?: string | null }
): void => {
  const { customerId, priceId } = options;

  if (customerId) {
    user.customerId = customerId;
  }

  if (priceId) {
    user.priceId = priceId;
  }

  user.hasAccess = true;

  if (user.trialStatus === "active") {
    user.trialStatus = "converted";
  }
};

const updateUserToInactiveAccess = (
  user: MutableUserDocument,
  options: { clearPriceId: boolean }
): void => {
  user.hasAccess = false;

  if (options.clearPriceId) {
    user.priceId = undefined;
  }
};

const findOrCreateUserFromCheckout = async (params: {
  userId: string | null;
  customerEmail: string | null;
}): Promise<MutableUserDocument | null> => {
  const { userId, customerEmail } = params;

  if (userId) {
    const userById = (await User.findById(userId)) as MutableUserDocument | null;
    if (userById) {
      return userById;
    }
  }

  if (!customerEmail) {
    return null;
  }

  const normalizedEmail = customerEmail.trim().toLowerCase();
  let userByEmail = (await User.findOne({ email: normalizedEmail })) as MutableUserDocument | null;

  if (!userByEmail) {
    userByEmail = (await User.create({
      email: normalizedEmail,
    })) as MutableUserDocument;
  }

  return userByEmail;
};

const claimStripeEvent = async (event: Stripe.Event): Promise<StripeEventClaimResult> => {
  const now = new Date();
  const lockExpiresAt = new Date(now.getTime() + STRIPE_EVENT_LOCK_MS);

  try {
    await ProcessedStripeEvent.create({
      eventId: event.id,
      eventType: event.type,
      status: "processing",
      attempts: 1,
      lockExpiresAt,
    });

    return { ok: true, action: "process", attempt: 1 };
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      return { ok: false, error: toErrorMessage(error) };
    }
  }

  const existing = await ProcessedStripeEvent.findOne({ eventId: event.id }).exec();
  if (!existing) {
    return { ok: true, action: "process", attempt: 1 };
  }

  if (existing.status === "processed") {
    return { ok: true, action: "skip", reason: "already_processed" };
  }

  if (existing.status === "processing" && existing.lockExpiresAt.getTime() > now.getTime()) {
    return { ok: true, action: "skip", reason: "in_progress" };
  }

  const claimed = await ProcessedStripeEvent.updateOne(
    {
      eventId: event.id,
      lockExpiresAt: { $lte: now },
    },
    {
      $set: {
        eventType: event.type,
        status: "processing",
        lockExpiresAt,
      },
      $inc: { attempts: 1 },
    }
  ).exec();

  if (claimed.modifiedCount > 0) {
    const refreshed = await ProcessedStripeEvent.findOne({ eventId: event.id }).exec();
    return { ok: true, action: "process", attempt: refreshed?.attempts ?? existing.attempts + 1 };
  }

  const latest = await ProcessedStripeEvent.findOne({ eventId: event.id }).exec();
  if (latest?.status === "processed") {
    return { ok: true, action: "skip", reason: "already_processed" };
  }

  if (latest?.status === "processing" && latest.lockExpiresAt.getTime() > now.getTime()) {
    return { ok: true, action: "skip", reason: "in_progress" };
  }

  return { ok: true, action: "process", attempt: latest?.attempts ?? existing.attempts + 1 };
};

const markStripeEventProcessed = async (eventId: string): Promise<void> => {
  await ProcessedStripeEvent.updateOne(
    { eventId },
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        lockExpiresAt: new Date(),
      },
      $unset: {
        lastError: 1,
      },
    }
  ).exec();
};

const markStripeEventFailed = async (eventId: string, errorMessage: string): Promise<void> => {
  await ProcessedStripeEvent.updateOne(
    { eventId },
    {
      $set: {
        status: "failed",
        lastError: errorMessage,
        lockExpiresAt: new Date(),
      },
    }
  ).exec();
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripeConfig = getStripeConfig();
  if (!stripeConfig) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured" },
      { status: 500 }
    );
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripeConfig.stripe.webhooks.constructEvent(
      body,
      signature,
      stripeConfig.webhookSecret
    );
  } catch (err) {
    const message = toErrorMessage(err);
    console.error(`Webhook signature verification failed. ${message}`);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await connectMongo();

  const claim = await claimStripeEvent(event);
  if (claim.ok === false) {
    console.error("Stripe webhook claim error:", claim.error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  if (claim.action === "skip") {
    return NextResponse.json(
      { received: true, skipped: true, reason: claim.reason },
      { status: 200 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const checkoutSession = event.data.object as Stripe.Checkout.Session;
        const session = await findCheckoutSession(checkoutSession.id);
        if (!session) {
          throw new Error(
            `Unable to retrieve completed checkout session ${checkoutSession.id}`
          );
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : typeof checkoutSession.customer === "string"
              ? checkoutSession.customer
              : null;
        let priceId = session.line_items?.data[0]?.price?.id ?? null;

        if (!priceId) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : typeof checkoutSession.subscription === "string"
                ? checkoutSession.subscription
                : null;

          if (subscriptionId) {
            const subscription =
              await stripeConfig.stripe.subscriptions.retrieve(subscriptionId);
            priceId = getSubscriptionPriceId(subscription);
          }
        }

        const knownPriceId = resolveKnownPriceId(priceId);
        if (!knownPriceId) {
          throw new Error(
            `Unknown or missing Stripe priceId for checkout session ${checkoutSession.id}`
          );
        }

        let customerEmail: string | null =
          session.customer_details?.email ??
          checkoutSession.customer_details?.email ??
          session.customer_email ??
          checkoutSession.customer_email ??
          null;

        if (!customerEmail && customerId) {
          const customer = await stripeConfig.stripe.customers.retrieve(customerId);
          if (!("deleted" in customer)) {
            customerEmail = customer.email ?? null;
          }
        }

        const user = await findOrCreateUserFromCheckout({
          userId: checkoutSession.client_reference_id ?? null,
          customerEmail,
        });

        if (!user) {
          throw new Error("Unable to resolve user for checkout.session.completed");
        }

        updateUserToPaidAccess(user, { customerId, priceId: knownPriceId });
        await user.save();

        break;
      }

      case "checkout.session.expired": {
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : null;
        if (!customerId) {
          break;
        }

        const user = (await User.findOne({
          customerId,
        })) as MutableUserDocument | null;
        if (!user) {
          break;
        }

        const knownPriceId = resolveKnownPriceId(getSubscriptionPriceId(subscription));

        if (hasActiveSubscriptionAccess(subscription.status)) {
          if (!knownPriceId) {
            throw new Error(
              `Unknown or missing Stripe priceId for subscription ${subscription.id}`
            );
          }
          updateUserToPaidAccess(user, { customerId, priceId: knownPriceId });
        } else if (INACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
          updateUserToInactiveAccess(user, { clearPriceId: true });
        } else {
          if (knownPriceId) {
            user.priceId = knownPriceId;
          }
          user.customerId = customerId;
        }

        await user.save();
        break;
      }

      case "customer.subscription.deleted": {
        const stripeObject = event.data.object as Stripe.Subscription;
        const subscription = await stripeConfig.stripe.subscriptions.retrieve(
          stripeObject.id
        );
        const subscriptionCustomerId =
          typeof subscription.customer === "string"
            ? subscription.customer
            : null;
        if (!subscriptionCustomerId) {
          break;
        }

        const user = (await User.findOne({
          customerId: subscriptionCustomerId,
        })) as MutableUserDocument | null;
        if (!user) {
          break;
        }

        updateUserToInactiveAccess(user, { clearPriceId: true });
        await user.save();

        break;
      }

      case "invoice.paid": {
        const stripeObject = event.data.object as Stripe.Invoice;

        let priceId = getInvoicePriceId(stripeObject);
        if (!priceId && typeof stripeObject.subscription === "string") {
          const subscription = await stripeConfig.stripe.subscriptions.retrieve(
            stripeObject.subscription
          );
          priceId = getSubscriptionPriceId(subscription);
        }

        const knownPriceId = resolveKnownPriceId(priceId);
        if (!knownPriceId) {
          throw new Error(`Unknown or missing Stripe priceId for invoice ${stripeObject.id}`);
        }
        const customerId =
          typeof stripeObject.customer === "string" ? stripeObject.customer : null;
        if (!customerId) {
          break;
        }

        const user = (await User.findOne({
          customerId,
        })) as MutableUserDocument | null;
        if (!user) {
          break;
        }

        updateUserToPaidAccess(user, { customerId, priceId: knownPriceId });
        await user.save();

        break;
      }

      case "invoice.payment_failed": {
        break;
      }

      default: {
        break;
      }
    }

    await markStripeEventProcessed(event.id);
  } catch (e) {
    const message = toErrorMessage(e);
    console.error("Stripe webhook processing error:", message);
    await markStripeEventFailed(event.id, message);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
