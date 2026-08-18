/**
 * Bids Routes
 *
 * CRUD for the bid pipeline, plus sub-resources:
 * comments, checklist items, and assignments.
 */

import { Hono } from "hono";
import type { Env } from "../app";
import { getUserByClerkId } from "../lib/db/users";
import {
  createBid,
  getBid,
  listBids,
  updateBid,
  deleteBid,
  getBidCountsByStatus,
} from "../lib/db/bids";
import {
  getAssignments,
  addAssignment,
  removeAssignment,
} from "../lib/db/bid-assignments";
import {
  getComments,
  createComment,
  deleteComment,
} from "../lib/db/bid-comments";
import {
  createOutcome,
  getOutcome,
  updateOutcome,
} from "../lib/db/bid-outcomes";
import {
  getChecklist,
  createChecklistItem,
  createChecklistItemsBatch,
  toggleChecklistItem,
  deleteChecklistItem,
  getChecklistProgress,
} from "../lib/db/bid-checklist";

export const bidRoutes = new Hono<Env>();

// ---------------------------------------------------------------------------
// Helper: resolve authenticated user + org
// ---------------------------------------------------------------------------

async function resolveUser(clerkUserId: string | undefined) {
  if (!clerkUserId) return null;
  return getUserByClerkId(clerkUserId);
}

// ============================================================================
// BIDS CRUD
// ============================================================================

/**
 * GET /bids — list bids for the user's org
 */
bidRoutes.get("/", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const statusParam = c.req.query("status");
    const limit = Number(c.req.query("limit")) || undefined;

    let statusFilter: string | string[] | undefined;
    if (statusParam) {
      statusFilter = statusParam.includes(",")
        ? statusParam.split(",")
        : statusParam;
    }

    const bids = await listBids(dbUser.organization_id, {
      status: statusFilter as any,
      limit,
    });

    return c.json({ bids });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to list bids" },
      500
    );
  }
});

/**
 * GET /bids/counts — bid counts by status (for Kanban column headers)
 */
bidRoutes.get("/counts", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const counts = await getBidCountsByStatus(dbUser.organization_id);
    return c.json({ counts });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get counts" },
      500
    );
  }
});

/**
 * POST /bids — create a new bid
 */
bidRoutes.post("/", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const bid = await createBid({
      organization_id: dbUser.organization_id,
      tender_id: body.tender_id,
      external_tender_id: body.external_tender_id,
      tender_title: body.tender_title || "Bando senza titolo",
      tender_buyer: body.tender_buyer,
      tender_value: body.tender_value,
      tender_deadline: body.tender_deadline,
      priority: body.priority || "medium",
      notes: body.notes,
      created_by: dbUser.id,
    });

    // Auto-generate default checklist items
    const defaultChecklist = [
      "Verifica requisiti di idoneità",
      "Preparazione documentazione amministrativa",
      "Preparazione offerta tecnica",
      "Preparazione offerta economica",
      "Revisione interna",
      "Firma digitale e invio",
    ];

    await createChecklistItemsBatch(
      defaultChecklist.map((label, i) => ({
        bid_id: bid.id,
        label,
        sort_order: i,
      }))
    );

    // Auto-assign creator as lead
    await addAssignment({
      bid_id: bid.id,
      user_id: dbUser.id,
      role: "lead",
      assigned_by: dbUser.id,
    });

    return c.json({ bid }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create bid" },
      500
    );
  }
});

/**
 * GET /bids/:id — get bid detail
 */
bidRoutes.get("/:id", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const [assignments, comments, checklist, progress] = await Promise.all([
      getAssignments(bid.id),
      getComments(bid.id),
      getChecklist(bid.id),
      getChecklistProgress(bid.id),
    ]);

    return c.json({
      bid,
      assignments,
      comments,
      checklist,
      checklistProgress: progress,
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get bid" },
      500
    );
  }
});

/**
 * PATCH /bids/:id — update bid (status, priority, notes)
 */
bidRoutes.patch("/:id", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const body = await c.req.json();
    const updates: Record<string, any> = {};

    if (body.status) updates.status = body.status;
    if (body.priority) updates.priority = body.priority;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.outcome_notes !== undefined) updates.outcome_notes = body.outcome_notes;

    // Auto-set timestamps on status transitions
    if (body.status === "submitted" && !bid.submitted_at) {
      updates.submitted_at = new Date().toISOString();
    }
    if ((body.status === "won" || body.status === "lost") && !bid.outcome_at) {
      updates.outcome_at = new Date().toISOString();
    }

    const updated = await updateBid(bid.id, updates);
    return c.json({ bid: updated });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to update bid" },
      500
    );
  }
});

/**
 * DELETE /bids/:id
 */
bidRoutes.delete("/:id", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    await deleteBid(bid.id);
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to delete bid" },
      500
    );
  }
});

// ============================================================================
// ASSIGNMENTS
// ============================================================================

/**
 * GET /bids/:id/assignments
 */
bidRoutes.get("/:id/assignments", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const assignments = await getAssignments(bid.id);
    return c.json({ assignments });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get assignments" },
      500
    );
  }
});

/**
 * POST /bids/:id/assignments
 */
bidRoutes.post("/:id/assignments", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const body = await c.req.json();
    const assignment = await addAssignment({
      bid_id: bid.id,
      user_id: body.user_id,
      role: body.role || "contributor",
      assigned_by: dbUser.id,
    });

    return c.json({ assignment }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to add assignment" },
      500
    );
  }
});

/**
 * DELETE /bids/:id/assignments/:userId
 */
bidRoutes.delete("/:id/assignments/:userId", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    await removeAssignment(bid.id, c.req.param("userId"));
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to remove assignment" },
      500
    );
  }
});

// ============================================================================
// COMMENTS
// ============================================================================

/**
 * GET /bids/:id/comments
 */
bidRoutes.get("/:id/comments", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const comments = await getComments(bid.id);
    return c.json({ comments });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get comments" },
      500
    );
  }
});

/**
 * POST /bids/:id/comments
 */
bidRoutes.post("/:id/comments", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const body = await c.req.json();
    if (!body.content?.trim()) {
      return c.json({ error: "Content is required" }, 400);
    }

    const comment = await createComment({
      bid_id: bid.id,
      user_id: dbUser.id,
      parent_id: body.parent_id,
      content: body.content.trim(),
    });

    return c.json({ comment }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create comment" },
      500
    );
  }
});

/**
 * DELETE /bids/:id/comments/:commentId
 */
bidRoutes.delete("/:id/comments/:commentId", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    await deleteComment(c.req.param("commentId"));
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to delete comment" },
      500
    );
  }
});

// ============================================================================
// CHECKLIST
// ============================================================================

/**
 * GET /bids/:id/checklist
 */
bidRoutes.get("/:id/checklist", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const [checklist, progress] = await Promise.all([
      getChecklist(bid.id),
      getChecklistProgress(bid.id),
    ]);

    return c.json({ checklist, progress });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get checklist" },
      500
    );
  }
});

/**
 * POST /bids/:id/checklist
 */
bidRoutes.post("/:id/checklist", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const body = await c.req.json();
    const item = await createChecklistItem({
      bid_id: bid.id,
      label: body.label,
      sort_order: body.sort_order ?? 999,
    });

    return c.json({ item }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create checklist item" },
      500
    );
  }
});

/**
 * PATCH /bids/:id/checklist/:itemId — toggle completed
 */
bidRoutes.patch("/:id/checklist/:itemId", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const body = await c.req.json();
    const item = await toggleChecklistItem(
      c.req.param("itemId"),
      body.completed,
      dbUser.id
    );

    return c.json({ item });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to update checklist item" },
      500
    );
  }
});

/**
 * DELETE /bids/:id/checklist/:itemId
 */
bidRoutes.delete("/:id/checklist/:itemId", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    await deleteChecklistItem(c.req.param("itemId"));
    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to delete checklist item" },
      500
    );
  }
});

// ============================================================================
// OUTCOMES (Post-Mortem)
// ============================================================================

/**
 * GET /bids/:id/outcome
 */
bidRoutes.get("/:id/outcome", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const outcome = await getOutcome(bid.id);
    return c.json({ outcome });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to get outcome" },
      500
    );
  }
});

/**
 * POST /bids/:id/outcome — record or update outcome
 */
bidRoutes.post("/:id/outcome", async (c) => {
  const dbUser = await resolveUser(c.get("userId"));
  if (!dbUser?.organization_id) {
    return c.json({ error: "Authentication required" }, 401);
  }

  try {
    const bid = await getBid(c.req.param("id"));
    if (!bid || bid.organization_id !== dbUser.organization_id) {
      return c.json({ error: "Bid not found" }, 404);
    }

    const body = await c.req.json();

    const outcome = await createOutcome({
      bid_id: bid.id,
      organization_id: dbUser.organization_id,
      outcome: body.outcome,
      winning_bidder: body.winning_bidder,
      winning_amount: body.winning_amount,
      num_bidders: body.num_bidders,
      reason: body.reason,
      lessons_learned: body.lessons_learned,
      tender_value: bid.tender_value || undefined,
      tender_buyer: bid.tender_buyer || undefined,
      outcome_date: body.outcome_date || new Date().toISOString().slice(0, 10),
    });

    // Also update bid status to match outcome
    const bidStatus = body.outcome === "won" ? "won" : "lost";
    await updateBid(bid.id, {
      status: bidStatus,
      outcome_at: new Date().toISOString(),
      outcome_notes: body.reason || body.lessons_learned || null,
    });

    return c.json({ outcome }, 201);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to record outcome" },
      500
    );
  }
});
