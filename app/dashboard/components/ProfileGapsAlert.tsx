"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useProfileGaps } from "@/lib/hooks/useDashboardData";
import { AlertTriangle, ArrowRight } from "lucide-react";

const FIELD_LABELS: Record<string, string> = {
  cpv_codes: "Codici CPV",
  certifications: "Certificazioni",
  operating_regions: "Regioni operative",
  services: "Servizi",
  annual_revenue: "Fatturato annuo",
  employee_count: "N. dipendenti",
  description: "Descrizione azienda",
  contract_size_range: "Range contratti",
  industry: "Settore",
  website: "Sito web",
  company_name: "Nome azienda",
};

export function ProfileGapsAlert() {
  const { data } = useProfileGaps();

  if (!data || !data.gaps || data.gaps.length === 0) return null;

  const completeness = data.completeness ?? 0;
  const topGaps = data.gaps.slice(0, 3);

  return (
    <Alert className="border-amber-200 bg-amber-50/50">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-900">
        Profilo completo al {Math.round(completeness)}%
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <Progress value={completeness} className="h-1.5 bg-amber-100 [&>[data-slot=progress-indicator]]:bg-amber-500" />
        <p className="text-sm text-amber-800">
          Campi mancanti:{" "}
          {topGaps
            .map((g) => FIELD_LABELS[g.field] || g.field)
            .join(", ")}
          {data.gaps.length > 3 && ` e altri ${data.gaps.length - 3}`}.
          {" "}Completali per migliorare le raccomandazioni.
        </p>
        <Button variant="outline" size="sm" className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100" asChild>
          <Link href="/settings/profile">
            Completa profilo
            <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}
