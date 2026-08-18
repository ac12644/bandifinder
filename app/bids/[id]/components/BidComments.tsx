"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { BidComment } from "@/lib/hooks/useBids";
import { useAddComment } from "@/lib/hooks/useBids";

interface BidCommentsProps {
  bidId: string;
  comments: BidComment[];
}

export function BidComments({ bidId, comments }: BidCommentsProps) {
  const [content, setContent] = useState("");
  const addComment = useAddComment(bidId);

  const handleSubmit = () => {
    if (!content.trim()) return;
    addComment.mutate(
      { content: content.trim() },
      {
        onSuccess: () => setContent(""),
        onError: () => toast.error("Errore nell'invio del commento"),
      }
    );
  };

  // Separate top-level and replies
  const topLevel = comments.filter((c) => !c.parent_id);
  const replies = comments.filter((c) => c.parent_id);

  const getReplies = (parentId: string) =>
    replies.filter((r) => r.parent_id === parentId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Commenti ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment list */}
        {topLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nessun commento ancora
          </p>
        ) : (
          <div className="space-y-3">
            {topLevel.map((comment) => (
              <div key={comment.id} className="space-y-2">
                <CommentItem comment={comment} />
                {getReplies(comment.id).map((reply) => (
                  <div key={reply.id} className="ml-6">
                    <CommentItem comment={reply} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* New comment form */}
        <div className="border-t pt-3 space-y-2">
          <Textarea
            placeholder="Scrivi un commento..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={2}
            className="text-sm resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!content.trim() || addComment.isPending}
            >
              <Send className="h-3 w-3 mr-1" />
              Invia
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CommentItem({ comment }: { comment: BidComment }) {
  const timeAgo = formatDistanceToNow(new Date(comment.created_at), {
    addSuffix: true,
    locale: it,
  });

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center">
          <span className="text-[10px] font-medium text-primary">U</span>
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo}</span>
      </div>
      <p className="text-sm">{comment.content}</p>
    </div>
  );
}
