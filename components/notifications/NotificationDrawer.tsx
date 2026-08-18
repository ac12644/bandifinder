"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NotificationItem, type Notification } from "./NotificationItem";
import { useApiQuery, useApiMutation } from "@/lib/hooks/useAuthedFetch";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface NotificationDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationDrawer({
  open,
  onOpenChange,
}: NotificationDrawerProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useApiQuery<{
    notifications: Notification[];
    count: number;
  }>(["notifications"], "/notifications?limit=30", {
    enabled: open,
  });

  const markAllRead = useApiMutation<{ success: boolean }, Record<string, never>>(
    "/notifications/read-all",
    "POST",
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        queryClient.invalidateQueries({ queryKey: ["notification-count"] });
      },
    }
  );

  const notifications = data?.notifications ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="flex flex-row items-center justify-between pr-4">
          <SheetTitle>Notifiche</SheetTitle>
          {notifications.some((n) => !n.read_at) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate({})}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Segna tutto letto
            </Button>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-80px)] mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nessuna notifica
            </p>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
