"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { KpiRow } from "./components/KpiRow";
import { HighFitTenders } from "./components/HighFitTenders";
import { UrgentDeadlines } from "./components/UrgentDeadlines";
import { ProfileGapsAlert } from "./components/ProfileGapsAlert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, BarChart3 } from "lucide-react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default function DashboardPage() {
  const { loading, user } = useAuth();

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="space-y-1">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const firstName = user?.displayName?.split(" ")[0];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header with greeting + quick actions */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">
            {getGreeting()}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Ecco un riepilogo delle tue attività
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/tenders">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Cerca bandi
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/analytics">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              Analisi
            </Link>
          </Button>
        </div>
      </div>

      {/* Profile gaps alert */}
      <ProfileGapsAlert />

      {/* KPI row */}
      <KpiRow />

      {/* Main content grid */}
      <div className="grid lg:grid-cols-2 gap-6">
        <HighFitTenders />
        <UrgentDeadlines />
      </div>
    </div>
  );
}
