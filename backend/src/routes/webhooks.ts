/**
 * Webhook Routes
 *
 * Handle incoming webhooks from external services (Clerk, Stripe, etc.)
 * Syncs Clerk events to Supabase users/organizations.
 */

import { Hono } from "hono";
import type { Env } from "../app";
import { verifyClerkWebhook } from "../lib/clerk";
import { logger } from "../lib/observability";
import {
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationByClerkId,
} from "../lib/db/organizations";
import { getStripe, planIdFromPriceId } from "../lib/stripe";
import {
  upsertUserByClerkId,
  deleteUserByClerkId,
  getUserByClerkId,
  updateUser,
} from "../lib/db/users";

export const webhookRoutes = new Hono<Env>();

// ============================================================================
// CLERK WEBHOOKS
// ============================================================================

/**
 * POST /webhooks/clerk - Handle Clerk webhook events
 */
webhookRoutes.post("/clerk", async (c) => {
  const payload = await c.req.text();

  const svixId = c.req.header("svix-id");
  const svixTimestamp = c.req.header("svix-timestamp");
  const svixSignature = c.req.header("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    logger.warn("Missing Svix headers in Clerk webhook");
    return c.json({ error: "Missing webhook signature headers" }, 400);
  }

  const result = await verifyClerkWebhook(payload, {
    "svix-id": svixId,
    "svix-timestamp": svixTimestamp,
    "svix-signature": svixSignature,
  });

  if (!result.success || !result.event) {
    logger.warn("Clerk webhook verification failed", {
      error: result.error,
    });
    return c.json(
      { error: result.error || "Webhook verification failed" },
      400
    );
  }

  const { type, data } = result.event;

  logger.info("Clerk webhook received", { type, id: data.id });

  try {
    switch (type) {
      case "user.created": {
        const emails = data.email_addresses as Array<{
          email_address: string;
        }>;
        await upsertUserByClerkId({
          clerk_user_id: data.id as string,
          email: emails?.[0]?.email_address,
          first_name: data.first_name as string | undefined,
          last_name: data.last_name as string | undefined,
          image_url: data.image_url as string | undefined,
        });
        logger.info("User synced to Supabase", {
          clerkUserId: data.id,
        });
        break;
      }

      case "user.updated": {
        const emails = data.email_addresses as Array<{
          email_address: string;
        }>;
        const dbUser = await getUserByClerkId(data.id as string);
        if (dbUser) {
          await updateUser(dbUser.id, {
            email: emails?.[0]?.email_address,
            first_name: data.first_name as string | undefined,
            last_name: data.last_name as string | undefined,
            image_url: data.image_url as string | undefined,
          });
        }
        logger.info("User updated in Supabase", {
          clerkUserId: data.id,
        });
        break;
      }

      case "user.deleted": {
        await deleteUserByClerkId(data.id as string);
        logger.info("User deleted from Supabase", {
          clerkUserId: data.id,
        });
        break;
      }

      case "organization.created": {
        await createOrganization({
          clerk_org_id: data.id as string,
          name: (data.name as string) || "Unnamed Organization",
          slug: data.slug as string | undefined,
        });
        logger.info("Organization synced to Supabase", {
          clerkOrgId: data.id,
        });
        break;
      }

      case "organization.updated": {
        const org = await getOrganizationByClerkId(
          data.id as string
        );
        if (org) {
          await updateOrganization(org.id, {
            name: data.name as string,
            slug: data.slug as string | undefined,
          });
        }
        logger.info("Organization updated in Supabase", {
          clerkOrgId: data.id,
        });
        break;
      }

      case "organizationMembership.created": {
        const membership = data as {
          id: string;
          organization: { id: string; name: string };
          public_user_data: { user_id: string };
          role: string;
        };

        const userId = membership.public_user_data?.user_id;
        const orgClerkId = membership.organization?.id;

        if (userId && orgClerkId) {
          const org =
            await getOrganizationByClerkId(orgClerkId);
          const dbUser = await getUserByClerkId(userId);

          if (org && dbUser) {
            await updateUser(dbUser.id, {
              organization_id: org.id,
              role: membership.role === "org:admin" ? "admin" : "member",
            });
          }
        }

        logger.info("User joined organization", {
          userId: membership.public_user_data?.user_id,
          orgId: membership.organization?.id,
          role: membership.role,
        });
        break;
      }

      case "organizationMembership.deleted": {
        const membership = data as {
          id: string;
          organization: { id: string };
          public_user_data: { user_id: string };
        };

        const userId = membership.public_user_data?.user_id;
        if (userId) {
          const dbUser = await getUserByClerkId(userId);
          if (dbUser) {
            await updateUser(dbUser.id, {
              organization_id: null,
              role: "member",
            });
          }
        }

        logger.info("User left organization", {
          userId: membership.public_user_data?.user_id,
          orgId: membership.organization?.id,
        });
        break;
      }

      default:
        logger.debug("Unhandled Clerk webhook event", { type });
    }
  } catch (error) {
    logger.error(
      "Clerk webhook handler error",
      error as Error,
      { type }
    );
    // Don't return 500 — acknowledge receipt to prevent retries
  }

  return c.json({ received: true });
});

// ============================================================================
// STRIPE WEBHOOKS
// ============================================================================

/**
 * POST /webhooks/stripe - Handle Stripe webhook events
 */
webhookRoutes.post("/stripe", async (c) => {
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_WEBHOOK_SECRET) {
    logger.error("STRIPE_WEBHOOK_SECRET not configured");
    return c.json({ error: "Webhook secret not configured" }, 500);
  }

  const payload = await c.req.text();
  const sig = c.req.header("stripe-signature");

  if (!sig) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", {
      error: err instanceof Error ? err.message : "Unknown",
    });
    return c.json({ error: "Webhook signature verification failed" }, 400);
  }

  logger.info("Stripe webhook received", {
    type: event.type,
    id: event.id,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.organization_id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (orgId && subscriptionId) {
          // Retrieve subscription to get the price/plan
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = sub.items.data[0]?.price?.id;
          const planId = priceId ? planIdFromPriceId(priceId) : "starter";

          await updateOrganization(orgId, {
            stripe_subscription_id: subscriptionId,
            stripe_customer_id:
              typeof session.customer === "string"
                ? session.customer
                : session.customer?.id || undefined,
            plan: planId,
          });

          logger.info("Organization upgraded", {
            orgId,
            plan: planId,
            subscriptionId,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organization_id;

        if (orgId) {
          const priceId = sub.items.data[0]?.price?.id;
          const planId = priceId ? planIdFromPriceId(priceId) : undefined;

          const updates: Record<string, any> = {};
          if (planId) updates.plan = planId;

          // If subscription was canceled (not renewing)
          if (sub.cancel_at_period_end) {
            logger.info("Subscription set to cancel at period end", {
              orgId,
            });
          }

          if (Object.keys(updates).length > 0) {
            await updateOrganization(orgId, updates);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const orgId = sub.metadata?.organization_id;

        if (orgId) {
          await updateOrganization(orgId, {
            plan: "free",
            stripe_subscription_id: undefined,
          });

          logger.info("Organization downgraded to free", { orgId });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;

        logger.warn("Payment failed", {
          customerId,
          invoiceId: invoice.id,
        });
        break;
      }

      default:
        logger.debug("Unhandled Stripe webhook event", {
          type: event.type,
        });
    }
  } catch (error) {
    logger.error("Stripe webhook handler error", error as Error, {
      type: event.type,
    });
  }

  return c.json({ received: true });
});

// ============================================================================
// HEALTH CHECK FOR WEBHOOKS
// ============================================================================

webhookRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    webhooks: {
      clerk: !!process.env.CLERK_WEBHOOK_SECRET,
      stripe: !!process.env.STRIPE_WEBHOOK_SECRET,
    },
  });
});
