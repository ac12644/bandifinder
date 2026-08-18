/**
 * Notifications DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbNotification {
  id: string;
  user_id: string;
  organization_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getNotifications(
  userId: string,
  params?: { unreadOnly?: boolean; limit?: number; offset?: number }
): Promise<{ notifications: DbNotification[]; total: number }> {
  const sb = getSupabaseAdmin();
  let q = sb
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (params?.unreadOnly) {
    q = q.is("read_at", null);
  }

  q = q
    .order("created_at", { ascending: false })
    .range(
      params?.offset || 0,
      (params?.offset || 0) + (params?.limit || 20) - 1
    );

  const { data, error, count } = await q;
  if (error) throw error;
  return { notifications: data || [], total: count || 0 };
}

export async function getUnreadCount(userId: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { count, error } = await sb
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
  return count || 0;
}

export async function markAsRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function markAllAsRead(userId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function createNotification(params: {
  user_id: string;
  organization_id: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<DbNotification> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("notifications")
    .insert(params)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createNotificationsBatch(
  notifications: Array<{
    user_id: string;
    organization_id: string;
    type: string;
    title: string;
    body?: string;
    link?: string;
    metadata?: Record<string, unknown>;
  }>
): Promise<void> {
  if (notifications.length === 0) return;

  const sb = getSupabaseAdmin();
  const { error } = await sb.from("notifications").insert(notifications);

  if (error) throw error;
}
