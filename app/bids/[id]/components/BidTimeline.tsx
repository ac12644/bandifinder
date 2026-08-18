"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Plus, ArrowRight, Trophy, XCircle, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import type { Bid } from "@/lib/hooks/useBids";

interface BidTimelineProps {
  bid: Bid;
}

interface TimelineEvent {
  icon: React.ReactNode;
  label: string;
  date: string;
  color: string;
}

export function BidTimeline({ bid }: BidTimelineProps) {
  const events: TimelineEvent[] = [];

  // Created
  events.push({
    icon: <Plus className="h-3 w-3" />,
    label: "Gara aggiunta alla pipeline",
    date: bid.created_at,
    color: "bg-blue-500",
  });

  // Submitted
  if (bid.submitted_at) {
    events.push({
      icon: <Send className="h-3 w-3" />,
      label: "Offerta inviata",
      date: bid.submitted_at,
      color: "bg-purple-500",
    });
  }

  // Outcome
  if (bid.outcome_at) {
    const isWon = bid.status === "won";
    events.push({
      icon: isWon ? (
        <Trophy className="h-3 w-3" />
      ) : (
        <XCircle className="h-3 w-3" />
      ),
      label: isWon ? "Gara vinta" : "Gara persa",
      date: bid.outcome_at,
      color: isWon ? "bg-green-500" : "bg-red-500",
    });
  }

  // Sort chronologically
  events.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map((event, i) => (
            <div key={i} className="flex items-start gap-3">
              <div
                className={`${event.color} text-white rounded-full p-1.5 mt-0.5 shrink-0`}
              >
                {event.icon}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{event.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(event.date), {
                    addSuffix: true,
                    locale: it,
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
