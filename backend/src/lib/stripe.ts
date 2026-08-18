/**
 * Stripe Integration
 *
 * Client, plan configuration, and billing helpers.
 */

import Stripe from "stripe";

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    // Pinned to the version this SDK release is built against. The SDK's types
    // enforce the match, so this moves in lockstep with the stripe package —
    // check webhook payload shapes when it changes.
    _stripe = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Plan Configuration
// ---------------------------------------------------------------------------

export interface PlanConfig {
  id: string;
  name: string;
  price: number;           // monthly EUR
  stripePriceId: string;   // set via env
  limits: PlanLimits;
}

export interface PlanLimits {
  searchesPerDay: number;
  favorites: number;
  users: number;
  bidsActive: number;
  sources: string[];       // data sources available
  exportEnabled: boolean;
  pipelineEnabled: boolean;
  apiAccess: boolean;
}

const FREE_LIMITS: PlanLimits = {
  searchesPerDay: 5,
  favorites: 10,
  users: 1,
  bidsActive: 3,
  sources: ["ted"],
  exportEnabled: false,
  pipelineEnabled: false,
  apiAccess: false,
};

const STARTER_LIMITS: PlanLimits = {
  searchesPerDay: 50,
  favorites: -1,      // unlimited
  users: 3,
  bidsActive: 20,
  sources: ["ted"],
  exportEnabled: true,
  pipelineEnabled: true,
  apiAccess: false,
};

const PRO_LIMITS: PlanLimits = {
  searchesPerDay: -1,  // unlimited
  favorites: -1,
  users: 10,
  bidsActive: -1,
  sources: ["ted", "anac"],
  exportEnabled: true,
  pipelineEnabled: true,
  apiAccess: true,
};

const ENTERPRISE_LIMITS: PlanLimits = {
  searchesPerDay: -1,
  favorites: -1,
  users: -1,
  bidsActive: -1,
  sources: ["ted", "anac", "custom"],
  exportEnabled: true,
  pipelineEnabled: true,
  apiAccess: true,
};

export const PLANS: Record<string, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    stripePriceId: "",
    limits: FREE_LIMITS,
  },
  starter: {
    id: "starter",
    name: "Starter",
    price: 99,
    stripePriceId: process.env.STRIPE_PRICE_STARTER || "",
    limits: STARTER_LIMITS,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 249,
    stripePriceId: process.env.STRIPE_PRICE_PRO || "",
    limits: PRO_LIMITS,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    price: 0, // custom pricing
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || "",
    limits: ENTERPRISE_LIMITS,
  },
};

/**
 * Get plan config by plan id. Falls back to free.
 */
export function getPlanConfig(planId: string): PlanConfig {
  return PLANS[planId] || PLANS.free;
}

/**
 * Get limits for a plan. Falls back to free.
 */
export function getPlanLimits(planId: string): PlanLimits {
  return getPlanConfig(planId).limits;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create or retrieve a Stripe Customer for an organization.
 */
export async function getOrCreateCustomer(params: {
  organizationId: string;
  organizationName: string;
  email?: string;
  existingCustomerId?: string;
}): Promise<string> {
  const stripe = getStripe();

  // Return existing if valid
  if (params.existingCustomerId) {
    try {
      const existing = await stripe.customers.retrieve(
        params.existingCustomerId
      );
      if (!existing.deleted) return existing.id;
    } catch {
      // Customer doesn't exist, create new
    }
  }

  const customer = await stripe.customers.create({
    name: params.organizationName,
    email: params.email,
    metadata: {
      organization_id: params.organizationId,
    },
  });

  return customer.id;
}

/**
 * Create a Stripe Checkout Session for a subscription.
 */
export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  organizationId: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();

  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: "subscription",
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      organization_id: params.organizationId,
    },
    subscription_data: {
      metadata: {
        organization_id: params.organizationId,
      },
    },
  });
}

/**
 * Create a Stripe Customer Portal session.
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<Stripe.BillingPortal.Session> {
  const stripe = getStripe();

  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

/**
 * Map a Stripe Price ID back to our plan ID.
 */
export function planIdFromPriceId(priceId: string): string {
  for (const [id, plan] of Object.entries(PLANS)) {
    if (plan.stripePriceId && plan.stripePriceId === priceId) {
      return id;
    }
  }
  return "free";
}
