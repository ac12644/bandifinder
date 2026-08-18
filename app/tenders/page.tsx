"use client";

import { useTenderSearch } from "@/lib/hooks/useTenderSearch";
import { TenderSearchBar } from "./components/TenderSearchBar";
import { TenderFilters } from "./components/TenderFilters";
import { TenderTable, TenderTableSkeleton } from "./components/TenderTable";
import { GuestBanner } from "@/components/guest/GuestBanner";

export default function TendersPage() {
  const {
    filters,
    updateFilters,
    resetFilters,
    tenders,
    total,
    isLoading,
    isFetching,
  } = useTenderSearch();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-4">
        <div>
          <p className="eyebrow">TED · ANAC</p>
          <h1 className="mt-1 text-3xl leading-none">Bandi</h1>
        </div>

        {!isLoading && (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono tabular-nums text-foreground">
              {total.toLocaleString("it-IT")}
            </span>{" "}
            {total === 1 ? "risultato" : "risultati"}
            {filters.query && <> per &ldquo;{filters.query}&rdquo;</>}
          </p>
        )}
      </div>

      {/* Guest prompt — renders nothing for signed-in users */}
      <GuestBanner />

      {/* Search bar */}
      <TenderSearchBar
        value={filters.query || ""}
        onChange={(query) => updateFilters({ query: query || undefined })}
        isLoading={isFetching}
      />

      {/* Filters — always visible */}
      <TenderFilters
        filters={filters}
        onChange={updateFilters}
        onReset={resetFilters}
      />

      {/* Results */}
      {isLoading ? (
        <TenderTableSkeleton />
      ) : (
        <TenderTable tenders={tenders} query={filters.query} />
      )}
    </div>
  );
}
