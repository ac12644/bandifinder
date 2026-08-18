"use client";

import { useRouter } from "next/navigation";
import { FitScoreBadge } from "@/components/tender/FitScoreBadge";
import { formatCompact, formatDate, daysUntilDeadline } from "@/lib/utils/formatters";
import { Building2, MapPin, Tag, ArrowRight, Clock, SearchX } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import type { SearchTender } from "@/lib/hooks/useTenderSearch";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CPV_CODES } from "@/lib/constants/profile-options";

// Build a quick lookup for CPV labels
const cpvLabelMap = new Map(CPV_CODES.map((c) => [c.code, c.label]));

function getCpvLabel(code: string | undefined): string | null {
  if (!code) return null;
  const exact = cpvLabelMap.get(code);
  if (exact) return exact;
  const divCode = code.slice(0, 2) + "000000";
  const div = cpvLabelMap.get(divCode);
  if (div) return div;
  return null;
}

/** Strip only the country prefix like "Italia – " */
function cleanTitle(title: string): string {
  const match = title.match(/^[A-Za-zÀ-ÿ]+\s*[–—-]\s*/);
  if (match && match[0].length < 30) {
    return title.slice(match[0].length) || title;
  }
  return title;
}

function DeadlineLabel({ deadline }: { deadline: string }) {
  const days = daysUntilDeadline(deadline);
  const isExpired = days !== null && days < 0;
  const isCritical = days !== null && days >= 0 && days <= 3;
  const isSoon = days !== null && days > 3 && days <= 7;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs tabular-nums",
        isExpired && "text-muted-foreground line-through decoration-1",
        isCritical && "text-urgent font-medium",
        isSoon && "text-review font-medium",
        !isExpired && !isCritical && !isSoon && "text-muted-foreground"
      )}
    >
      <Clock className="h-3 w-3 shrink-0" />
      {formatDate(deadline)}
      {(isCritical || isSoon) && days !== null && (
        <span className="font-mono text-[0.625rem]">{days}g</span>
      )}
      {isExpired && (
        <span className="font-mono text-[0.625rem]">scaduto</span>
      )}
    </span>
  );
}

export function TenderTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card px-5 py-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-32 rounded-md" />
            <Skeleton className="h-6 w-16 rounded-md" />
            <Skeleton className="h-6 w-24 rounded-md" />
          </div>
          <div className="flex justify-between pt-2 border-t border-border/40">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface TenderTableProps {
  tenders: SearchTender[];
  query?: string;
}

export function TenderTable({ tenders, query }: TenderTableProps) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const pageSize = 12;
  const totalPages = Math.ceil(tenders.length / pageSize);
  const visible = tenders.slice(page * pageSize, (page + 1) * pageSize);

  if (!tenders.length) {
    return (
      <Empty className="py-16">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX />
          </EmptyMedia>
          <EmptyTitle>Nessun bando trovato</EmptyTitle>
          <EmptyDescription>
            {query
              ? <>Nessun risultato per &ldquo;{query}&rdquo;. Prova con altri termini o modifica i filtri.</>
              : "Prova a modificare i filtri di ricerca o amplia il periodo."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-3">
      {visible.map((tender, i) => {
        const cpvLabel = getCpvLabel(tender.cpv);
        const title = cleanTitle(tender.title);
        const hasValue = tender.value != null && tender.value > 0;
        const hasDeadline = !!tender.deadline;
        const hasFitScore = tender.fitScore != null;

        return (
          <div
            key={tender.id || i}
            onClick={() => tender.id && router.push(`/tenders/${tender.id}`)}
            className={cn(
              "group relative rounded-xl border bg-card px-5 py-4 transition-all cursor-pointer",
              "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            )}
          >
            {/* Top row: title + value */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                  {title}
                </h3>
              </div>

              {hasValue && (
                <div className="shrink-0 text-right">
                  <span className="text-base font-bold tabular-nums text-foreground">
                    {formatCompact(tender.value)} €
                  </span>
                </div>
              )}
            </div>

            {/* Middle row: metadata chips */}
            <div className="flex flex-wrap items-center gap-2 mt-2.5">
              {tender.buyer && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate max-w-[200px]">{tender.buyer}</span>
                </span>
              )}

              {tender.country && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {tender.country}
                </span>
              )}

              {tender.cpv && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1">
                  <Tag className="h-3 w-3 shrink-0" />
                  {cpvLabel
                    ? cpvLabel.replace(/^\d+\s*-\s*/, "")
                    : `CPV ${tender.cpv}`}
                </span>
              )}
            </div>

            {/* Bottom row: deadline + score + arrow */}
            <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/40">
              <div className="flex items-center gap-4">
                {hasDeadline ? (
                  <DeadlineLabel deadline={tender.deadline!} />
                ) : (
                  <span className="text-xs text-muted-foreground/60 italic">
                    Scadenza non indicata
                  </span>
                )}

                {hasFitScore && (
                  <FitScoreBadge score={tender.fitScore!} size="sm" showLabel />
                )}
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 pt-4">
          <p className="text-sm text-muted-foreground tabular-nums">
            Pagina {page + 1} di {totalPages} · {tenders.length} bandi
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Successivo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
