"use client";

import {
  Clock,
  FileWarning,
  FileEdit,
  AlertTriangle,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/utils/formatters";
import { useApiMutation } from "@/lib/hooks/useAuthedFetch";
import { useQueryClient } from "@tanstack/react-query";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

const TYPE_CONFIG: Record<
  string,
  { Icon: React.ElementType; color: string }
> = {
  deadline_approaching: { Icon: Clock, color: "text-amber-500" },
  missing_document: { Icon: FileWarning, color: "text-red-500" },
  amendment_published: { Icon: FileEdit, color: "text-blue-500" },
  high_risk_clause: { Icon: AlertTriangle, color: "text-red-500" },
  high_fit_tender: { Icon: Star, color: "text-emerald-500" },
};

interface NotificationItemProps {
  notification: Notification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const queryClient = useQueryClient();
  const config = TYPE_CONFIG[notification.type] ?? {
    Icon: Star,
    color: "text-muted-foreground",
  };

  const markRead = useApiMutation<{ success: boolean }, Record<string, never>>(
    `/notifications/${notification.id}/read`,
    "PATCH",
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      },
    }
  );

  const isUnread = !notification.read_at;

  const handleClick = () => {
    if (isUnread) markRead.mutate({});
    if (notification.link) {
      window.location.href = notification.link;
    }
  };

  return (
    <button
      className={cn(
        "w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3",
        isUnread ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
      )}
      onClick={handleClick}
    >
      <config.Icon className={cn("h-4 w-4 mt-0.5 shrink-0", config.color)} />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm",
            isUnread ? "font-medium" : "text-muted-foreground"
          )}
        >
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatDate(notification.created_at)}
        </p>
      </div>
      {isUnread && (
        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
      )}
    </button>
  );
}
