"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TenderSearchFilters } from "@/lib/hooks/useTenderSearch";

const COUNTRIES = [
  { value: "all", label: "Tutti i paesi" },
  { value: "ITA", label: "Italia" },
  { value: "DEU", label: "Germania" },
  { value: "FRA", label: "Francia" },
  { value: "ESP", label: "Spagna" },
  { value: "BEL", label: "Belgio" },
  { value: "NLD", label: "Paesi Bassi" },
];

const DAYS_BACK_OPTIONS = [
  { value: "3", label: "Ultimi 3 giorni" },
  { value: "7", label: "Ultima settimana" },
  { value: "14", label: "Ultime 2 settimane" },
  { value: "30", label: "Ultimo mese" },
  { value: "90", label: "Ultimi 3 mesi" },
];

interface TenderFiltersProps {
  filters: TenderSearchFilters;
  onChange: (update: Partial<TenderSearchFilters>) => void;
  onReset: () => void;
}

function countActiveFilters(filters: TenderSearchFilters): number {
  let count = 0;
  if (filters.country) count++;
  if (filters.minValue) count++;
  if (filters.maxValue) count++;
  if (filters.daysBack && filters.daysBack !== 14) count++;
  return count;
}

export function TenderFilters({
  filters,
  onChange,
  onReset,
}: TenderFiltersProps) {
  const activeCount = countActiveFilters(filters);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtri</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
              {activeCount}
            </Badge>
          )}
        </div>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Paese</Label>
          <Select
            value={filters.country || "all"}
            onValueChange={(v) =>
              onChange({ country: v === "all" ? undefined : v })
            }
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Periodo</Label>
          <Select
            value={String(filters.daysBack || 14)}
            onValueChange={(v) => onChange({ daysBack: Number(v) })}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_BACK_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Valore min (€)</Label>
          <Input
            type="number"
            className="h-9 text-sm"
            placeholder="0"
            value={filters.minValue || ""}
            onChange={(e) =>
              onChange({
                minValue: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Valore max (€)</Label>
          <Input
            type="number"
            className="h-9 text-sm"
            placeholder="Illimitato"
            value={filters.maxValue || ""}
            onChange={(e) =>
              onChange({
                maxValue: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
