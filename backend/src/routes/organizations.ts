/**
 * Organizations Routes
 *
 * Organization management and onboarding state.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import {
  getOrganizationById,
  updateOnboardingState,
} from "../lib/db/organizations";

export const organizationRoutes = new Hono<Env>();

const onboardingStateSchema = z.object({
  state: z.enum([
    "pending",
    "org_created",
    "profile_started",
    "profile_complete",
    "active",
  ]),
});

/**
 * GET /organizations/:orgId/onboarding-state
 */
organizationRoutes.get("/:orgId/onboarding-state", async (c) => {
  const orgId = c.req.param("orgId");
  const userId = c.get("userId");

  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const org = await getOrganizationById(orgId);
    if (!org) {
      return c.json({ error: "Organization not found" }, 404);
    }

    return c.json({
      orgId: org.id,
      onboardingState: org.onboarding_state,
      name: org.name,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get onboarding state",
      },
      500
    );
  }
});

/**
 * PATCH /organizations/:orgId/onboarding-state
 */
organizationRoutes.patch(
  "/:orgId/onboarding-state",
  zValidator("json", onboardingStateSchema),
  async (c) => {
    const orgId = c.req.param("orgId");
    const userId = c.get("userId");
    const { state } = c.req.valid("json");

    if (!userId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const org = await updateOnboardingState(orgId, state);
      return c.json({
        orgId: org.id,
        onboardingState: org.onboarding_state,
      });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update onboarding state",
        },
        500
      );
    }
  }
);
