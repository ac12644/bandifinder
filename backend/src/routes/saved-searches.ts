/**
 * Saved Searches Routes
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import {
  getSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
} from "../lib/db/saved-searches";
import { getUserByClerkId } from "../lib/db/users";

export const savedSearchRoutes = new Hono<Env>();

const createSchema = z.object({
  name: z.string().min(1),
  query: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  notify: z.boolean().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  query: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  notify: z.boolean().optional(),
});

/**
 * GET /saved-searches
 */
savedSearchRoutes.get("/", async (c) => {
  const clerkUserId = c.get("userId");
  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ savedSearches: [] });
    }

    const searches = await getSavedSearches(dbUser.id);
    return c.json({ savedSearches: searches });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get saved searches",
      },
      500
    );
  }
});

/**
 * POST /saved-searches
 */
savedSearchRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const clerkUserId = c.get("userId");
  const body = c.req.valid("json");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser || !dbUser.organization_id) {
      return c.json({ error: "User or organization not found" }, 404);
    }

    const search = await createSavedSearch({
      user_id: dbUser.id,
      organization_id: dbUser.organization_id,
      name: body.name,
      query: body.query,
      filters: body.filters,
      notify: body.notify,
    });

    return c.json({ savedSearch: search }, 201);
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create saved search",
      },
      500
    );
  }
});

/**
 * PATCH /saved-searches/:id
 */
savedSearchRoutes.patch(
  "/:id",
  zValidator("json", updateSchema),
  async (c) => {
    const clerkUserId = c.get("userId");
    const searchId = c.req.param("id");
    const body = c.req.valid("json");

    if (!clerkUserId) {
      return c.json({ error: "Authentication required" }, 401);
    }

    try {
      const dbUser = await getUserByClerkId(clerkUserId);
      if (!dbUser) {
        return c.json({ error: "User not found" }, 404);
      }

      const search = await updateSavedSearch(searchId, dbUser.id, body);
      return c.json({ savedSearch: search });
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to update saved search",
        },
        500
      );
    }
  }
);

/**
 * DELETE /saved-searches/:id
 */
savedSearchRoutes.delete("/:id", async (c) => {
  const clerkUserId = c.get("userId");
  const searchId = c.req.param("id");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await deleteSavedSearch(searchId, dbUser.id);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete saved search",
      },
      500
    );
  }
});
