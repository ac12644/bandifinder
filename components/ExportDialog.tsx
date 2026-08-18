"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Download, FileText, Table, Loader2, CheckCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { API_BASE_URL } from "@/lib/apiConfig";

const BASE_URL = API_BASE_URL;

interface ExportTender {
  pubno?: string;
  PubNo?: string;
  publicationNumber?: string;
  title?: string;
  Title?: string;
  buyer?: string;
  Buyer?: string;
  published?: string;
  Published?: string;
  publicationDate?: string;
  deadline?: string;
  Deadline?: string;
  cpv?: string | string[];
  CPV?: string;
  value?: number | string;
  Value?: number | string;
  pdf?: string;
  PDF?: string;
}

interface ExportDialogProps {
  tenders: ExportTender[];
  title?: string;
  children?: React.ReactNode;
}

export function ExportDialog({
  tenders,
  title = "Bandi",
  children,
}: ExportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<"csv" | "pdf">("csv");
  const [loading, setLoading] = React.useState(false);

  // Normalize tender data for export
  const normalizeRows = (): Array<Record<string, unknown>> => {
    return tenders.map((t) => ({
      pubno: t.pubno || t.PubNo || t.publicationNumber || "",
      title: t.title || t.Title || "",
      buyer: t.buyer || t.Buyer || "",
      published: t.published || t.Published || t.publicationDate || "",
      deadline: t.deadline || t.Deadline || "",
      cpv: Array.isArray(t.cpv) ? t.cpv[0] : t.cpv || t.CPV || "",
      value: t.value ?? t.Value ?? "",
      pdf: t.pdf || t.PDF || "",
    }));
  };

  const handleExportCsv = async () => {
    setLoading(true);
    try {
      const rows = normalizeRows();

      // Generate CSV client-side for faster export
      const headers = [
        "PubNo",
        "Buyer",
        "Title",
        "Published",
        "Deadline",
        "CPV",
        "Value",
        "PDF",
      ];

      const csvEscape = (s: unknown) => {
        if (s == null) return "";
        const str = String(s);
        if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
      };

      const lines = [headers.join(",")];
      for (const row of rows) {
        lines.push(
          [
            csvEscape(row.pubno),
            csvEscape(row.buyer),
            csvEscape(row.title),
            csvEscape(row.published),
            csvEscape(row.deadline),
            csvEscape(row.cpv),
            csvEscape(row.value),
            csvEscape(row.pdf),
          ].join(",")
        );
      }

      const csv = lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("CSV esportato con successo!");
      setOpen(false);
    } catch (error) {
      console.error("Export CSV error:", error);
      toast.error("Errore durante l'esportazione CSV");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPdf = async () => {
    setLoading(true);
    try {
      const rows = normalizeRows();

      const response = await fetch(`${BASE_URL}/exportPdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows,
          title,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      // Open in new window for printing
      const printWindow = window.open(url, "_blank");
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.focus();
          // Auto-trigger print dialog
          setTimeout(() => {
            printWindow.print();
          }, 500);
        };
      }

      toast.success("Report PDF aperto! Usa Stampa → Salva come PDF");
      setOpen(false);
    } catch (error) {
      console.error("Export PDF error:", error);
      toast.error("Errore durante l'esportazione PDF");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (exportFormat === "csv") {
      handleExportCsv();
    } else {
      handleExportPdf();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Esporta
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Esporta Bandi</DialogTitle>
          <DialogDescription>
            Esporta {tenders.length} bandi nel formato desiderato.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-700">Formato di esportazione</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat("csv")}
                className={cn(
                  "relative p-4 rounded-xl border-2 text-center transition-all duration-200",
                  "hover:shadow-md hover:scale-[1.02]",
                  exportFormat === "csv"
                    ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                {exportFormat === "csv" && (
                  <div className="absolute -top-2 -right-2">
                    <div className="p-1 rounded-full bg-green-500 shadow">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
                <div className={cn(
                  "p-3 rounded-xl mx-auto mb-3 w-fit transition-colors",
                  exportFormat === "csv" ? "bg-green-100" : "bg-gray-100"
                )}>
                  <Table className={cn(
                    "h-6 w-6",
                    exportFormat === "csv" ? "text-green-600" : "text-gray-500"
                  )} />
                </div>
                <div className="font-semibold text-gray-900">CSV</div>
                <div className="text-xs text-gray-500 mt-1">Per Excel/Fogli</div>
              </button>
              <button
                type="button"
                onClick={() => setExportFormat("pdf")}
                className={cn(
                  "relative p-4 rounded-xl border-2 text-center transition-all duration-200",
                  "hover:shadow-md hover:scale-[1.02]",
                  exportFormat === "pdf"
                    ? "border-red-500 bg-gradient-to-br from-red-50 to-orange-50 shadow-sm"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                )}
              >
                {exportFormat === "pdf" && (
                  <div className="absolute -top-2 -right-2">
                    <div className="p-1 rounded-full bg-red-500 shadow">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </div>
                  </div>
                )}
                <div className={cn(
                  "p-3 rounded-xl mx-auto mb-3 w-fit transition-colors",
                  exportFormat === "pdf" ? "bg-red-100" : "bg-gray-100"
                )}>
                  <FileText className={cn(
                    "h-6 w-6",
                    exportFormat === "pdf" ? "text-red-600" : "text-gray-500"
                  )} />
                </div>
                <div className="font-semibold text-gray-900">PDF</div>
                <div className="text-xs text-gray-500 mt-1">Report stampabile</div>
              </button>
            </div>
          </div>

          <div className={cn(
            "text-sm p-4 rounded-xl border transition-colors",
            exportFormat === "csv"
              ? "bg-green-50/50 border-green-100 text-green-700"
              : "bg-red-50/50 border-red-100 text-red-700"
          )}>
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
              <p>
                {exportFormat === "csv" ? (
                  <>
                    Il file CSV può essere aperto con <strong>Excel</strong>,{" "}
                    <strong>Google Sheets</strong> o altri software di foglio di calcolo.
                  </>
                ) : (
                  <>
                    Verrà generato un report HTML che potrai stampare come PDF dal
                    browser (<kbd className="px-1.5 py-0.5 rounded bg-red-100 text-xs font-mono">File → Stampa → Salva come PDF</kbd>).
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Tender count badge */}
          <div className="flex justify-center">
            <Badge variant="secondary" className="text-xs">
              {tenders.length} {tenders.length === 1 ? "bando" : "bandi"} da esportare
            </Badge>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Annulla
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading}
            className={cn(
              "w-full sm:w-auto",
              exportFormat === "csv"
                ? "bg-green-600 hover:bg-green-700"
                : "bg-red-600 hover:bg-red-700"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Esportazione...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Esporta {exportFormat.toUpperCase()}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
