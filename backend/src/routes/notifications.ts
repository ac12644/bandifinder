/**
 * Notifications Routes
 */

import { Hono } from "hono";
import type { Env } from "../app";
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../lib/db/notifications";
import { getUserByClerkId } from "../lib/db/users";

export const notificationRoutes = new Hono<Env>();

/**
 * GET /notifications
 */
notificationRoutes.get("/", async (c) => {
  const clerkUserId = c.get("userId");
  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ notifications: [], total: 0, unreadCount: 0 });
    }

    const unreadOnly = c.req.query("unread") === "true";
    const limit = Number(c.req.query("limit")) || 20;
    const offset = Number(c.req.query("offset")) || 0;

    const [result, unreadCount] = await Promise.all([
      getNotifications(dbUser.id, { unreadOnly, limit, offset }),
      getUnreadCount(dbUser.id),
    ]);

    return c.json({
      notifications: result.notifications,
      total: result.total,
      unreadCount,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to get notifications",
      },
      500
    );
  }
});

/**
 * PATCH /notifications/:id/read
 */
notificationRoutes.patch("/:id/read", async (c) => {
  const clerkUserId = c.get("userId");
  const notificationId = c.req.param("id");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await markAsRead(dbUser.id, notificationId);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to mark notification as read",
      },
      500
    );
  }
});

/**
 * POST /notifications/read-all
 */
notificationRoutes.post("/read-all", async (c) => {
  const clerkUserId = c.get("userId");

  if (!clerkUserId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const dbUser = await getUserByClerkId(clerkUserId);
    if (!dbUser) {
      return c.json({ error: "User not found" }, 404);
    }

    await markAllAsRead(dbUser.id);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to mark all as read",
      },
      500
    );
  }
});
