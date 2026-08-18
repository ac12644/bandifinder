/**
 * Conversations DB Layer
 */

import { getSupabaseAdmin } from "../supabase";

export interface DbConversation {
  id: string;
  thread_id: string;
  user_id: string | null;
  organization_id: string | null;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbConversationMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function getOrCreateConversation(params: {
  thread_id: string;
  user_id?: string;
  organization_id?: string;
  title?: string;
}): Promise<DbConversation> {
  const sb = getSupabaseAdmin();

  // Try to get existing
  const { data: existing } = await sb
    .from("conversations")
    .select("*")
    .eq("thread_id", params.thread_id)
    .single();

  if (existing) return existing;

  // Create new
  const { data, error } = await sb
    .from("conversations")
    .insert({
      thread_id: params.thread_id,
      user_id: params.user_id || null,
      organization_id: params.organization_id || null,
      title: params.title || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function addMessage(params: {
  conversation_id: string;
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<DbConversationMessage> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("conversation_messages")
    .insert({
      conversation_id: params.conversation_id,
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMessages(
  threadId: string,
  limit: number = 50
): Promise<DbConversationMessage[]> {
  const sb = getSupabaseAdmin();
  const { data: conv } = await sb
    .from("conversations")
    .select("id")
    .eq("thread_id", threadId)
    .single();

  if (!conv) return [];

  const { data, error } = await sb
    .from("conversation_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getUserConversations(
  userId: string,
  limit: number = 20
): Promise<DbConversation[]> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}
