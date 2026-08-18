/**
 * Billing Routes
 *
 * Stripe checkout, subscription management, and customer portal.
 */

import { Hono } from "hono";
import type { Env } from "../app";
import { getUserByClerkId } from "../lib/db/users";
import {
  getOrganizationById,
  updateOrganization,
} from "../lib/db/organizations";
import {
  getStripe,
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  getPlanConfig,
  PLANS,
} from "../lib/stripe";

export const billingRoutes = new Hono<Env>();

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveOrg(clerkUserId: string | undefined) {
  if (!clerkUserId) return null;
  const dbUser = await getUserByClerkId(clerkUserId);
  if (!dbUser?.organization_id) return null;
  const org = await getOrganizationById(dbUser.organization_id);
  return org ? { dbUser, org } : null;
}

// ============================================================================
// GET /billing — current subscription info
// ============================================================================

billingRoutes.get("/", async (c) => {
  const ctx = await resolveOrg(c.get("userId"));
  if (!ctx) return c.json({ error: "Authentication required" }, 401);

  const { org } = ctx;
  const planConfig = getPlanConfig(org.plan);

  // If they have a Stripe subscription, fetch details
  let subscription: any = null;
  if (org.stripe_subscription_id) {
    try {
      const stripe = getStripe();
      const sub = await stripe.subscriptions.retrieve(
        org.stripe_subscription_id
      );
      const periodEnd = sub.items.data[0]?.current_period_end;
      subscription = {
        id: sub.id,
        status: sub.status,
        currentPeriodEnd: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
    } catch {
      // Subscription no longer exists
    }
  }

  return c.json({
    plan: {
      id: planConfig.id,
      name: planConfig.name,
      price: planConfig.price,
      limits: planConfig.limits,
    },
    subscription,
    hasCustomer: !!org.stripe_customer_id,
  });
});

// ============================================================================
// GET /billing/plans — available plans
// ============================================================================

billingRoutes.get("/plans", async (c) => {
  const plans = Object.values(PLANS)
    .filter((p) => p.id !== "enterprise")
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      limits: p.limits,
    }));

  return c.json({ plans });
});

// ============================================================================
// POST /billing/checkout — create Stripe Checkout session
// ============================================================================

billingRoutes.post("/checkout", async (c) => {
  const ctx = await resolveOrg(c.get("userId"));
  if (!ctx) return c.json({ error: "Authentication required" }, 401);

  const { dbUser, org } = ctx;
  const body = await c.req.json();
  const planId = body.planId as string;

  const planConfig = getPlanConfig(planId);
  if (!planConfig.stripePriceId) {
    return c.json({ error: "Piano non disponibile" }, 400);
  }

  try {
    // Ensure we have a Stripe customer
    const customerId = await getOrCreateCustomer({
      organizationId: org.id,
      organizationName: org.name,
      email: dbUser.email || undefined,
      existingCustomerId: org.stripe_customer_id || undefined,
    });

    // Store customer ID if new
    if (!org.stripe_customer_id || org.stripe_customer_id !== customerId) {
      await updateOrganization(org.id, { stripe_customer_id: customerId });
    }

    const baseUrl =
      process.env.FRONTEND_URL || "https://bandifinder.it";

    const session = await createCheckoutSession({
      customerId,
      priceId: planConfig.stripePriceId,
      successUrl: `${baseUrl}/settings/billing?success=true`,
      cancelUrl: `${baseUrl}/settings/billing?canceled=true`,
      organizationId: org.id,
    });

    return c.json({ url: session.url });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create checkout session",
      },
      500
    );
  }
});

// ============================================================================
// POST /billing/portal — create Stripe Customer Portal session
// ============================================================================

billingRoutes.post("/portal", async (c) => {
  const ctx = await resolveOrg(c.get("userId"));
  if (!ctx) return c.json({ error: "Authentication required" }, 401);

  const { org } = ctx;

  if (!org.stripe_customer_id) {
    return c.json({ error: "Nessun account di fatturazione trovato" }, 400);
  }

  try {
    const baseUrl =
      process.env.FRONTEND_URL || "https://bandifinder.it";

    const session = await createPortalSession({
      customerId: org.stripe_customer_id,
      returnUrl: `${baseUrl}/settings/billing`,
    });

    return c.json({ url: session.url });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create portal session",
      },
      500
    );
  }
});

// ============================================================================
// POST /billing/cancel — cancel subscription at period end
// ============================================================================

billingRoutes.post("/cancel", async (c) => {
  const ctx = await resolveOrg(c.get("userId"));
  if (!ctx) return c.json({ error: "Authentication required" }, 401);

  const { org } = ctx;

  if (!org.stripe_subscription_id) {
    return c.json({ error: "Nessun abbonamento attivo" }, 400);
  }

  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(org.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to cancel subscription",
      },
      500
    );
  }
});
