"use client";

import Link from "next/link";
import { useBids } from "@/lib/hooks/useBids";
import { KanbanBoard } from "./components/KanbanBoard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kanban, Search, AlertCircle } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import type { Bid } from "@/lib/hooks/useBids";

function PipelineStats({ bids }: { bids: Bid[] }) {
  const active = bids.filter((b) => !["won", "lost"].includes(b.status)).length;
  const submitted = bids.filter((b) => b.status === "submitted").length;
  const won = bids.filter((b) => b.status === "won").length;

  return (
    <div className="flex items-center gap-3">
      <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
        <span className="text-muted-foreground">Attive</span>
        <span className="font-bold tabular-nums">{active}</span>
      </Badge>
      <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
        <span className="text-muted-foreground">Inviate</span>
        <span className="font-bold tabular-nums">{submitted}</span>
      </Badge>
      <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 text-xs font-medium">
        <span className="text-muted-foreground">Vinte</span>
        <span className="font-bold text-emerald-600 tabular-nums">{won}</span>
      </Badge>
    </div>
  );
}

function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden pb-4">
      {Array.from({ length: 6 }).map((_, col) => (
        <div key={col} className="flex-shrink-0 w-[280px]">
          <div className="flex items-center gap-2 mb-3 px-1">
            <Skeleton className="h-2 w-2 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-6 rounded-md ml-auto" />
          </div>
          <div className="rounded-lg bg-muted/30 p-2 space-y-2 min-h-[200px]">
            {Array.from({ length: col < 3 ? 2 : col < 5 ? 1 : 0 }).map((_, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-5 w-10 rounded-md shrink-0" />
                </div>
                <Skeleton className="h-3 w-2/3" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PipelinePage() {
  const { data, isLoading, error } = useBids();
  const bids = data?.bids || [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Kanban className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Pipeline</h1>
            <p className="text-sm text-muted-foreground">
              Gestisci le tue candidature dalla scoperta all&apos;esito
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isLoading && bids.length > 0 && <PipelineStats bids={bids} />}
          <Button variant="outline" size="sm" asChild>
            <Link href="/tenders">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Cerca bandi
            </Link>
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <KanbanSkeleton />
      ) : error ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <AlertCircle />
            </EmptyMedia>
            <EmptyTitle>Errore nel caricamento</EmptyTitle>
            <EmptyDescription>
              Non è stato possibile caricare la pipeline. Riprova più tardi.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : bids.length === 0 ? (
        <Empty className="py-20">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Kanban />
            </EmptyMedia>
            <EmptyTitle>Nessuna candidatura</EmptyTitle>
            <EmptyDescription>
              Inizia cercando bandi e candidandoti per popolare la tua pipeline.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/tenders">
                <Search className="h-4 w-4 mr-2" />
                Cerca bandi
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <KanbanBoard bids={bids} />
      )}
    </div>
  );
}
