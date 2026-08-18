"use client";

import {
  Building2,
  MapPin,
  Calendar,
  FileText,
  Tag,
  Users,
  Layers,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/formatters";
import { CPV_CODES } from "@/lib/constants/profile-options";
import type { TenderDetail } from "@/lib/hooks/useTenderDetail";

const cpvLabelMap = new Map(CPV_CODES.map((c) => [c.code, c.label]));

function getCpvLabel(code: string): string {
  const exact = cpvLabelMap.get(code);
  if (exact) return exact.replace(/^\d+(\.\d+)?\s*-\s*/, "");
  const div = cpvLabelMap.get(code.slice(0, 2) + "000000");
  if (div) return div.replace(/^\d+\s*-\s*/, "");
  return code;
}

/** Strip only the country prefix like "Italia – " */
function cleanTitle(title: string): string {
  const match = title.match(/^[A-Za-zÀ-ÿ]+\s*[–—-]\s*/);
  if (match && match[0].length < 30) {
    return title.slice(match[0].length) || title;
  }
  return title;
}

/** Fix mojibake encoding issues */
function fixEncoding(text: string): string {
  return text
    .replace(/ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢/g, "'")
    .replace(/Ã¢â‚¬â„¢/g, "'")
    .replace(/Ã¢â‚¬Â/g, "–")
    .replace(/Ã¢â‚¬Å"/g, '"')
    .replace(/Ã¢â‚¬Â/g, '"')
    .replace(/Ã¨/g, "è")
    .replace(/Ã©/g, "é")
    .replace(/Ã /g, "à")
    .replace(/Ã¹/g, "ù")
    .replace(/Ã²/g, "ò")
    .replace(/Ã¬/g, "ì")
    .replace(/Ã‰/g, "É")
    .replace(/Ã€/g, "À")
    .replace(/Ã¢/g, "â")
    .replace(/Ãª/g, "ê")
    .replace(/Ã®/g, "î")
    .replace(/Ã´/g, "ô")
    .replace(/Ã»/g, "û")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¤/g, "ä")
    .replace(/Ã§/g, "ç");
}

const PROCEDURE_TYPE_MAP: Record<string, string> = {
  open: "Procedura aperta",
  restricted: "Procedura ristretta",
  negotiated: "Procedura negoziata",
  competitive_dialogue: "Dialogo competitivo",
  innovation_partnership: "Partenariato per l'innovazione",
  direct: "Affidamento diretto",
};

const CONTRACT_NATURE_MAP: Record<string, string> = {
  works: "Lavori",
  services: "Servizi",
  supplies: "Forniture",
};

interface TenderHeaderProps {
  tender: TenderDetail;
}

export function TenderHeader({ tender }: TenderHeaderProps) {
  const title = cleanTitle(tender.title);
  const uniqueCpvs = [...new Set(tender.cpvCodes || [])];
  const procedureLabel =
    tender.procedureType
      ? PROCEDURE_TYPE_MAP[tender.procedureType] || tender.procedureType
      : null;
  const natureLabel =
    tender.contractNature
      ? CONTRACT_NATURE_MAP[tender.contractNature] || tender.contractNature
      : null;

  const infoItems: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }[] = [];

  if (tender.country) {
    infoItems.push({
      icon: MapPin,
      label: "Paese",
      value: tender.country + (tender.city ? `, ${tender.city}` : ""),
    });
  }
  if (tender.publishedDate) {
    infoItems.push({ icon: Calendar, label: "Pubblicato", value: formatDate(tender.publishedDate) });
  }
  if (procedureLabel) {
    infoItems.push({ icon: FileText, label: "Procedura", value: procedureLabel });
  }
  if (natureLabel) {
    infoItems.push({ icon: Layers, label: "Tipo contratto", value: natureLabel });
  }
  if (tender.isFrameworkAgreement) {
    infoItems.push({ icon: Layers, label: "Accordo quadro", value: "Sì" });
  }
  if (tender.smeParticipation) {
    infoItems.push({ icon: Users, label: "PMI ammesse", value: "Sì" });
  }
  if (tender.publicationNumber) {
    infoItems.push({ icon: FileText, label: "N. pubblicazione", value: tender.publicationNumber });
  }

  return (
    <div className="space-y-4">
      {/* Title + Buyer */}
      <div>
        <h1 className="text-xl font-bold leading-tight">{fixEncoding(title)}</h1>
        {tender.buyer && (
          <p className="text-sm text-muted-foreground mt-1.5 flex items-center gap-1.5">
            <Building2 className="h-4 w-4 shrink-0" />
            {tender.buyer}
          </p>
        )}
      </div>

      {/* Info grid */}
      {infoItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-4">
          {infoItems.map((item) => (
            <InfoItem key={item.label} icon={item.icon} label={item.label} value={item.value} />
          ))}
        </div>
      )}

      {/* CPV codes */}
      {uniqueCpvs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground shrink-0" />
          {uniqueCpvs.map((cpv) => (
            <Badge key={cpv} variant="secondary" className="text-xs font-normal">
              {cpv} — {getCpvLabel(cpv)}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium truncate">{value}</p>
      </div>
    </div>
  );
}
