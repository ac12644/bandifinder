"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiQuery } from "@/lib/hooks/useAuthedFetch";
import { NotificationDrawer } from "./NotificationDrawer";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data } = useApiQuery<{ count: number }>(
    ["notification-count"],
    "/notifications?unreadOnly=true&limit=0",
    { refetchInterval: 60 * 1000 }
  );

  const unread = data?.count ?? 0;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="relative"
        onClick={() => setOpen(true)}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1"
            )}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>

      <NotificationDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
