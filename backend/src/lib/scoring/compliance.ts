/**
 * Compliance / Eligibility Checker
 *
 * Deterministic checks producing a checklist of requirements.
 * Each item: { requirement, met, detail? }
 */

import type { DbCompanyProfile } from "../db/company-profiles";
import type { DbTender } from "../db/tenders";

export interface EligibilityItem {
  requirement: string;
  met: boolean;
  detail?: string;
}

export function checkEligibility(
  tender: DbTender,
  profile: DbCompanyProfile | null
): EligibilityItem[] {
  const items: EligibilityItem[] = [];

  if (!profile) {
    items.push({
      requirement: "Profilo aziendale completo",
      met: false,
      detail: "Completa il profilo per una valutazione accurata",
    });
    return items;
  }

  // 1. CPV code match
  const tenderCpv = (tender.cpv_codes as string[]) || [];
  const profileCpv = (profile.cpv_codes as string[]) || [];
  if (tenderCpv.length > 0) {
    const hasMatch = tenderCpv.some((tc) =>
      profileCpv.some((pc) => tc.substring(0, 5) === pc.substring(0, 5))
    );
    items.push({
      requirement: "Codici CPV corrispondenti",
      met: hasMatch,
      detail: hasMatch
        ? `Corrispondenza CPV trovata`
        : `CPV bando: ${tenderCpv.slice(0, 3).join(", ")} — non presenti nel profilo`,
    });
  }

  // 2. Geographic eligibility
  const tenderCountry = tender.country;
  const regions = (profile.operating_regions as string[]) || [];
  if (tenderCountry && regions.length > 0) {
    const matches = regions.some(
      (r) => r.toUpperCase() === tenderCountry.toUpperCase()
    );
    items.push({
      requirement: `Operatività in ${tenderCountry}`,
      met: matches,
      detail: matches
        ? `${tenderCountry} è tra le tue regioni operative`
        : `Regioni operative: ${regions.join(", ")}`,
    });
  } else if (tenderCountry) {
    items.push({
      requirement: `Operatività in ${tenderCountry}`,
      met: false,
      detail: "Aggiungi le regioni operative al profilo",
    });
  }

  // 3. Contract value within capacity
  const tenderValue = tender.value ? Number(tender.value) : null;
  const revenue = profile.annual_revenue
    ? Number(profile.annual_revenue)
    : null;
  const sizeMin = profile.contract_size_min
    ? Number(profile.contract_size_min)
    : null;
  const sizeMax = profile.contract_size_max
    ? Number(profile.contract_size_max)
    : null;

  if (tenderValue) {
    if (sizeMin !== null || sizeMax !== null) {
      const inRange =
        (sizeMin === null || tenderValue >= sizeMin) &&
        (sizeMax === null || tenderValue <= sizeMax);
      items.push({
        requirement: "Valore nel range contrattuale",
        met: inRange,
        detail: inRange
          ? `€${tenderValue.toLocaleString("it-IT")} nel range preferito`
          : `€${tenderValue.toLocaleString("it-IT")} fuori dal range (${sizeMin ? `min €${sizeMin.toLocaleString("it-IT")}` : ""}${sizeMin && sizeMax ? " - " : ""}${sizeMax ? `max €${sizeMax.toLocaleString("it-IT")}` : ""})`,
      });
    } else if (revenue) {
      const withinCapacity = tenderValue <= revenue * 0.5;
      items.push({
        requirement: "Capacità economica adeguata",
        met: withinCapacity,
        detail: withinCapacity
          ? `Valore contratto (€${tenderValue.toLocaleString("it-IT")}) ≤ 50% del fatturato`
          : `Valore contratto (€${tenderValue.toLocaleString("it-IT")}) supera il 50% del fatturato annuo`,
      });
    }
  }

  // 4. Key certifications
  const companyCerts = (profile.certifications as string[]) || [];
  const certsUpper = companyCerts.map((c) => c.toUpperCase());

  // ISO 9001 (common requirement)
  const hasIso9001 = certsUpper.some(
    (c) => c.includes("ISO 9001") || c.includes("ISO9001")
  );
  items.push({
    requirement: "ISO 9001 (Qualità)",
    met: hasIso9001,
    detail: hasIso9001
      ? "Certificazione qualità presente"
      : "Certificazione spesso richiesta nei bandi pubblici",
  });

  // SOA (required for Italian public works above threshold)
  if (
    tender.contract_nature === "works" ||
    (tender.country === "ITA" && tenderValue && tenderValue > 150000)
  ) {
    const hasSoa = certsUpper.some((c) => c.includes("SOA"));
    items.push({
      requirement: "Attestazione SOA",
      met: hasSoa,
      detail: hasSoa
        ? "Attestazione SOA presente"
        : "Richiesta per lavori pubblici in Italia sopra €150.000",
    });
  }

  // 5. SME eligibility
  if (tender.sme_participation) {
    const employees = profile.employee_count || 0;
    const isSme = employees <= 250 || (revenue !== null && revenue <= 50_000_000);
    items.push({
      requirement: "Partecipazione PMI ammessa",
      met: isSme,
      detail: isSme
        ? "La tua azienda si qualifica come PMI"
        : "L'azienda potrebbe non qualificarsi come PMI",
    });
  }

  // 6. Deadline not passed
  if (tender.deadline) {
    const deadlineDate = new Date(tender.deadline);
    const now = new Date();
    const daysLeft = Math.ceil(
      (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    items.push({
      requirement: "Scadenza non superata",
      met: daysLeft >= 0,
      detail:
        daysLeft >= 0
          ? `${daysLeft} giorni rimanenti`
          : `Scadenza superata da ${Math.abs(daysLeft)} giorni`,
    });
  }

  // 7. Profile completeness
  const completeness = profile.completeness_score || 0;
  items.push({
    requirement: "Profilo aziendale completo (≥80%)",
    met: completeness >= 80,
    detail:
      completeness >= 80
        ? `Profilo al ${completeness}%`
        : `Profilo al ${completeness}% — completa per migliorare l'analisi`,
  });

  return items;
}
