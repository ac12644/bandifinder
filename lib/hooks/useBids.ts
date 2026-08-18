"use client";

import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE_URL } from "@/lib/apiConfig";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BidStatus =
  | "new"
  | "reviewing"
  | "preparing"
  | "submitted"
  | "won"
  | "lost";

export interface Bid {
  id: string;
  organization_id: string;
  tender_id: string | null;
  external_tender_id: string | null;
  tender_title: string;
  tender_buyer: string | null;
  tender_value: number | null;
  tender_deadline: string | null;
  status: BidStatus;
  priority: "low" | "medium" | "high";
  notes: string | null;
  created_by: string;
  submitted_at: string | null;
  outcome_at: string | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BidAssignment {
  id: string;
  bid_id: string;
  user_id: string;
  role: "lead" | "contributor" | "reviewer";
  assigned_by: string | null;
  created_at: string;
}

export interface BidComment {
  id: string;
  bid_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  bid_id: string;
  label: string;
  completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// List bids
// ---------------------------------------------------------------------------

export function useBids(status?: string) {
  const endpoint = status ? `/bids?status=${status}` : "/bids";
  return useApiQuery<{ bids: Bid[] }>(["bids", status || "all"], endpoint);
}

// ---------------------------------------------------------------------------
// Bid counts by status (for Kanban headers)
// ---------------------------------------------------------------------------

export function useBidCounts() {
  return useApiQuery<{ counts: Record<string, number> }>(
    ["bid-counts"],
    "/bids/counts"
  );
}

// ---------------------------------------------------------------------------
// Single bid detail
// ---------------------------------------------------------------------------

export function useBidDetail(bidId: string) {
  return useApiQuery<{
    bid: Bid;
    assignments: BidAssignment[];
    comments: BidComment[];
    checklist: ChecklistItem[];
    checklistProgress: { total: number; completed: number };
  }>(["bid-detail", bidId], `/bids/${bidId}`, { enabled: !!bidId });
}

// ---------------------------------------------------------------------------
// Create bid
// ---------------------------------------------------------------------------

export function useCreateBid() {
  const qc = useQueryClient();
  return useApiMutation<
    { bid: Bid },
    {
      tender_id?: string;
      external_tender_id?: string;
      tender_title: string;
      tender_buyer?: string;
      tender_value?: number;
      tender_deadline?: string;
      notes?: string;
    }
  >("/bids", "POST", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: ["bid-counts"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Update bid (status, priority, notes)
// ---------------------------------------------------------------------------

export function useUpdateBid(bidId: string) {
  const qc = useQueryClient();
  return useApiMutation<
    { bid: Bid },
    Partial<Pick<Bid, "status" | "priority" | "notes" | "outcome_notes">>
  >(`/bids/${bidId}`, "PATCH", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: ["bid-detail", bidId] });
      qc.invalidateQueries({ queryKey: ["bid-counts"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Delete bid
// ---------------------------------------------------------------------------

export function useDeleteBid(bidId: string) {
  const qc = useQueryClient();
  return useApiMutation<{ success: boolean }, void>(`/bids/${bidId}`, "DELETE", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: ["bid-counts"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export function useAddComment(bidId: string) {
  const qc = useQueryClient();
  return useApiMutation<
    { comment: BidComment },
    { content: string; parent_id?: string }
  >(`/bids/${bidId}/comments`, "POST", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bid-detail", bidId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export function useToggleChecklistItem(bidId: string) {
  const qc = useQueryClient();
  const { idToken, uid } = useAuth();

  return useMutation<{ item: ChecklistItem }, Error, { itemId: string; completed: boolean }>({
    mutationFn: async ({ itemId, completed }) => {
      const res = await fetch(`${API_BASE_URL}/bids/${bidId}/checklist/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          ...(uid ? { "x-user-id": uid } : {}),
        },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bid-detail", bidId] });
    },
  });
}

// ---------------------------------------------------------------------------
// Move bid (generic: any bid ID + status, for drag-and-drop)
// ---------------------------------------------------------------------------

export function useMoveBid() {
  const qc = useQueryClient();
  const { idToken, uid } = useAuth();

  return useMutation<
    { bid: Bid },
    Error,
    { bidId: string; status: BidStatus },
    { previousBids: { bids: Bid[] } | undefined }
  >({
    mutationFn: async ({ bidId, status }) => {
      const res = await fetch(`${API_BASE_URL}/bids/${bidId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          ...(uid ? { "x-user-id": uid } : {}),
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    // Optimistic update: move card immediately in cache
    onMutate: async ({ bidId, status }) => {
      await qc.cancelQueries({ queryKey: ["bids"] });
      const previousBids = qc.getQueryData<{ bids: Bid[] }>(["bids", "all"]);

      // Update the bid's status in all cached bid lists
      qc.setQueriesData<{ bids: Bid[] }>(
        { queryKey: ["bids"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            bids: old.bids.map((b) =>
              b.id === bidId ? { ...b, status } : b
            ),
          };
        }
      );

      return { previousBids };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousBids) {
        qc.setQueryData(["bids", "all"], context.previousBids);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["bids"] });
      qc.invalidateQueries({ queryKey: ["bid-counts"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Checklist - add item
// ---------------------------------------------------------------------------

export function useAddChecklistItem(bidId: string) {
  const qc = useQueryClient();
  return useApiMutation<
    { item: ChecklistItem },
    { label: string; sort_order?: number }
  >(`/bids/${bidId}/checklist`, "POST", {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bid-detail", bidId] });
    },
  });
}
