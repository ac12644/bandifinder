"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TenderHeader } from "./components/TenderHeader";
import { ScoreBreakdown } from "./components/ScoreBreakdown";
import { EligibilitySection } from "./components/EligibilitySection";
import { TenderActions } from "./components/TenderActions";
import { TenderSidebar } from "./components/TenderSidebar";
import {
  useTenderDetail,
  useTenderAnalysis,
} from "@/lib/hooks/useTenderDetail";

/** Fix mojibake encoding issues in description text */
function fixEncoding(text: string): string {
  return text
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢/g, "'")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Â/g, "–")
    .replace(/Ã¢â‚¬Å"/g, '"')
    .replace(/Ã¨/g, "è")
    .replace(/Ã©/g, "é")
    .replace(/Ã /g, "à")
    .replace(/Ã¹/g, "ù")
    .replace(/Ã²/g, "ò")
    .replace(/Ã¬/g, "ì")
    .replace(/Ã§/g, "ç");
}

export default function TenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: detailData, isLoading: detailLoading } = useTenderDetail(id);
  const { data: analysisData, isLoading: analysisLoading } =
    useTenderAnalysis(id);

  const tender = detailData?.tender;

  if (detailLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-5 w-16 mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="rounded-full bg-muted p-4 mx-auto w-fit mb-4">
          <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
        </div>
        <p className="font-medium">Bando non trovato</p>
        <p className="text-sm text-muted-foreground mt-1">
          Il bando potrebbe essere stato rimosso o l&apos;ID non è valido.
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/tenders">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna ai bandi
          </Link>
        </Button>
      </div>
    );
  }

  const mergedTender = {
    ...tender,
    publishedDate: tender.publishedDate || tender.publicationDate,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Back navigation */}
      <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
        <Link href="/tenders">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Bandi
        </Link>
      </Button>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main content — left 2/3 */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header with title, buyer, info grid, CPVs */}
          <TenderHeader tender={mergedTender} />

          {/* Description */}
          {tender.description && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Descrizione</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
                  {fixEncoding(tender.description)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Analysis tabs */}
          {analysisLoading ? (
            <Card>
              <CardContent className="py-12 flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  Analisi in corso...
                </span>
              </CardContent>
            </Card>
          ) : (analysisData?.components || analysisData?.eligibility) ? (
            <Tabs defaultValue="score" className="w-full">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="score">Analisi compatibilità</TabsTrigger>
                <TabsTrigger value="eligibility">Requisiti idoneità</TabsTrigger>
              </TabsList>
              <TabsContent value="score" className="mt-4">
                {analysisData?.components ? (
                  <ScoreBreakdown
                    components={analysisData.components}
                    overallScore={analysisData.overallScore}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Analisi non disponibile
                  </p>
                )}
              </TabsContent>
              <TabsContent value="eligibility" className="mt-4">
                {analysisData?.eligibility ? (
                  <EligibilitySection items={analysisData.eligibility} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Requisiti non disponibili
                  </p>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </div>

        {/* Sidebar — right 1/3 */}
        <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
          <TenderSidebar
            tender={mergedTender}
            analysis={analysisData}
            analysisLoading={analysisLoading}
          />

          {/* Actions */}
          <TenderActions
            tenderId={id}
            tenderTitle={tender.title}
            tenderBuyer={tender.buyer}
            tenderValue={tender.value}
            tenderDeadline={tender.deadline}
          />
        </div>
      </div>
    </div>
  );
}
