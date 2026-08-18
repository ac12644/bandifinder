/**
 * Preferences Routes
 *
 * User preference management using Supabase.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import {
  getPreferences,
  upsertPreferences,
  deletePreferences,
} from "../lib/db/preferences";
import { getUserByClerkId } from "../lib/db/users";

export const preferencesRoutes = new Hono<Env>();

const preferencesSchema = z.object({
  defaultDaysBack: z.number().optional(),
  defaultMinValue: z.number().optional(),
  defaultMaxValue: z.number().optional(),
  defaultCountries: z.array(z.string()).optional(),
  defaultCpvCodes: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  notificationEmail: z.boolean().optional(),
  notificationInApp: z.boolean().optional(),
  emailDigest: z.enum(["daily", "weekly", "never"]).optional(),
});

/**
 * GET /preferences - Get user preferences
 */
preferencesRoutes.get("/", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ preferences: {}, exists: false });
    }

    const prefs = await getPreferences(dbUser.id);

    return c.json({
      preferences: prefs || {},
      exists: !!prefs,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get preferences",
      },
      500
    );
  }
});

/**
 * POST /preferences - Update preferences
 */
preferencesRoutes.post(
  "/",
  zValidator("json", preferencesSchema),
  async (c) => {
    const clerkUserId = c.get("userId");
    const body = c.req.valid("json");

    if (!clerkUserId) {
      return c.json({ error: "User ID required" }, 400);
    }

    try {
      const dbUser = await getUserByClerkId(clerkUserId);
      if (!dbUser || !dbUser.organization_id) {
        return c.json(
          { error: "User or organization not found" },
          404
        );
      }

      const prefs = await upsertPreferences(
        dbUser.id,
        dbUser.organization_id,
        {
          default_days_back: body.defaultDaysBack,
          default_min_value: body.defaultMinValue,
          default_max_value: body.defaultMaxValue,
          default_countries: body.defaultCountries,
          default_cpv_codes: body.defaultCpvCodes,
          keywords: body.keywords,
          exclude_keywords: body.excludeKeywords,
          notification_email: body.notificationEmail,
          notification_in_app: body.notificationInApp,
          email_digest: body.emailDigest,
        }
      );

      return c.json({ success: true, preferences: prefs });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to save preferences",
        },
        500
      );
    }
  }
);

/**
 * DELETE /preferences - Reset preferences
 */
preferencesRoutes.delete("/", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "User ID required" }, 400);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await deletePreferences(dbUser.id);

    return c.json({ success: true, message: "Preferences reset" });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to reset preferences",
      },
      500
    );
  }
});
