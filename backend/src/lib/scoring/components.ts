/**
 * Scoring Components
 *
 * Each component evaluates one dimension of tender-company fit.
 * Returns { name, score, maxScore, explanation } in Italian.
 */

import type { DbCompanyProfile } from "../db/company-profiles";
import type { DbTender } from "../db/tenders";

export interface ScoreResult {
  name: string;
  score: number;
  maxScore: number;
  explanation: string;
}

// ============================================================================
// CPV MATCH (0-25)
// ============================================================================

export function scoreCpvMatch(
  tender: DbTender,
  profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 25;
  const tenderCpv = (tender.cpv_codes as string[]) || [];
  const profileCpv = (profile.cpv_codes as string[]) || [];

  if (tenderCpv.length === 0 || profileCpv.length === 0) {
    return {
      name: "Corrispondenza CPV",
      score: 0,
      maxScore,
      explanation:
        tenderCpv.length === 0
          ? "Nessun codice CPV specificato nel bando"
          : "Aggiungi i codici CPV al tuo profilo aziendale",
    };
  }

  // Match at different CPV prefix levels (2-digit division, 3-digit group, 5-digit class, full)
  let exactMatches = 0;
  let classMatches = 0; // 5-digit prefix
  let groupMatches = 0; // 3-digit prefix
  let divisionMatches = 0; // 2-digit prefix

  for (const tc of tenderCpv) {
    for (const pc of profileCpv) {
      if (tc === pc) {
        exactMatches++;
      } else if (tc.substring(0, 5) === pc.substring(0, 5)) {
        classMatches++;
      } else if (tc.substring(0, 3) === pc.substring(0, 3)) {
        groupMatches++;
      } else if (tc.substring(0, 2) === pc.substring(0, 2)) {
        divisionMatches++;
      }
    }
  }

  let score = 0;
  let explanation = "";

  if (exactMatches > 0) {
    score = maxScore;
    explanation = `${exactMatches} codici CPV corrispondono esattamente ai tuoi servizi`;
  } else if (classMatches > 0) {
    score = Math.round(maxScore * 0.8);
    explanation = `${classMatches} codici CPV nella stessa classe dei tuoi servizi`;
  } else if (groupMatches > 0) {
    score = Math.round(maxScore * 0.5);
    explanation = `${groupMatches} codici CPV nello stesso gruppo dei tuoi servizi`;
  } else if (divisionMatches > 0) {
    score = Math.round(maxScore * 0.25);
    explanation = `Codici CPV nella stessa divisione, ma diversa specializzazione`;
  } else {
    explanation = "Nessuna corrispondenza CPV con il tuo profilo";
  }

  return { name: "Corrispondenza CPV", score, maxScore, explanation };
}

// ============================================================================
// REVENUE FIT (0-20)
// ============================================================================

export function scoreRevenueFit(
  tender: DbTender,
  profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 20;
  const tenderValue = tender.value ? Number(tender.value) : null;
  const revenue = profile.annual_revenue ? Number(profile.annual_revenue) : null;
  const sizeMin = profile.contract_size_min ? Number(profile.contract_size_min) : null;
  const sizeMax = profile.contract_size_max ? Number(profile.contract_size_max) : null;

  if (!tenderValue) {
    return {
      name: "Adeguatezza economica",
      score: Math.round(maxScore * 0.5),
      maxScore,
      explanation: "Valore del bando non specificato",
    };
  }

  // Check contract size range first (more explicit preference)
  if (sizeMin !== null || sizeMax !== null) {
    const inMin = sizeMin === null || tenderValue >= sizeMin;
    const inMax = sizeMax === null || tenderValue <= sizeMax;

    if (inMin && inMax) {
      return {
        name: "Adeguatezza economica",
        score: maxScore,
        maxScore,
        explanation: `Valore (€${formatNum(tenderValue)}) nel range preferito`,
      };
    }

    // Slightly out of range
    if (sizeMax && tenderValue <= sizeMax * 1.5) {
      return {
        name: "Adeguatezza economica",
        score: Math.round(maxScore * 0.6),
        maxScore,
        explanation: `Valore (€${formatNum(tenderValue)}) leggermente sopra il range preferito`,
      };
    }

    return {
      name: "Adeguatezza economica",
      score: Math.round(maxScore * 0.2),
      maxScore,
      explanation: `Valore (€${formatNum(tenderValue)}) fuori dal range contrattuale preferito`,
    };
  }

  // Fallback to revenue-based heuristic
  if (!revenue) {
    return {
      name: "Adeguatezza economica",
      score: Math.round(maxScore * 0.4),
      maxScore,
      explanation: "Aggiungi fatturato annuo al profilo per una valutazione precisa",
    };
  }

  const ratio = tenderValue / revenue;

  if (ratio <= 0.3) {
    return {
      name: "Adeguatezza economica",
      score: maxScore,
      maxScore,
      explanation: `Valore (€${formatNum(tenderValue)}) adeguato al fatturato aziendale`,
    };
  }

  if (ratio <= 0.5) {
    return {
      name: "Adeguatezza economica",
      score: Math.round(maxScore * 0.7),
      maxScore,
      explanation: `Valore (€${formatNum(tenderValue)}) impegnativo ma gestibile`,
    };
  }

  return {
    name: "Adeguatezza economica",
    score: Math.round(maxScore * 0.3),
    maxScore,
    explanation: `Valore (€${formatNum(tenderValue)}) supera il 50% del fatturato annuo — alto rischio`,
  };
}

// ============================================================================
// GEOGRAPHIC MATCH (0-15)
// ============================================================================

export function scoreGeographicMatch(
  tender: DbTender,
  profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 15;
  const tenderCountry = tender.country;
  const regions = (profile.operating_regions as string[]) || [];

  if (!tenderCountry) {
    return {
      name: "Corrispondenza geografica",
      score: Math.round(maxScore * 0.5),
      maxScore,
      explanation: "Paese del bando non specificato",
    };
  }

  if (regions.length === 0) {
    return {
      name: "Corrispondenza geografica",
      score: 0,
      maxScore,
      explanation: "Aggiungi le regioni operative al tuo profilo",
    };
  }

  // Direct match
  if (regions.some((r) => r.toUpperCase() === tenderCountry.toUpperCase())) {
    return {
      name: "Corrispondenza geografica",
      score: maxScore,
      maxScore,
      explanation: `Il bando è in ${tenderCountry}, una delle tue regioni operative`,
    };
  }

  // EU proximity heuristic
  const euCountries = new Set([
    "AUT", "BEL", "BGR", "HRV", "CYP", "CZE", "DNK", "EST", "FIN",
    "FRA", "DEU", "GRC", "HUN", "IRL", "ITA", "LVA", "LTU", "LUX",
    "MLT", "NLD", "POL", "PRT", "ROU", "SVK", "SVN", "ESP", "SWE",
  ]);

  const bothEu =
    euCountries.has(tenderCountry.toUpperCase()) &&
    regions.some((r) => euCountries.has(r.toUpperCase()));

  if (bothEu) {
    return {
      name: "Corrispondenza geografica",
      score: Math.round(maxScore * 0.5),
      maxScore,
      explanation: `Bando in ${tenderCountry} — diverso paese UE, accessibile`,
    };
  }

  return {
    name: "Corrispondenza geografica",
    score: Math.round(maxScore * 0.2),
    maxScore,
    explanation: `Bando in ${tenderCountry} — fuori dalle tue regioni operative`,
  };
}

// ============================================================================
// CERTIFICATION MATCH (0-20)
// ============================================================================

export function scoreCertificationMatch(
  tender: DbTender,
  profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 20;
  const companyCerts = (profile.certifications as string[]) || [];
  const companyServices = (profile.services as string[]) || [];

  // Since TED API doesn't provide structured certification requirements,
  // we score based on company readiness (cert portfolio strength)
  if (companyCerts.length === 0) {
    return {
      name: "Certificazioni",
      score: Math.round(maxScore * 0.15),
      maxScore,
      explanation: "Nessuna certificazione nel profilo — aggiungi ISO, SOA, ecc.",
    };
  }

  // Check for key certifications
  const hasCerts = companyCerts.map((c) => c.toUpperCase());
  const hasIso9001 = hasCerts.some((c) => c.includes("ISO 9001") || c.includes("ISO9001"));
  const hasIso14001 = hasCerts.some((c) => c.includes("ISO 14001") || c.includes("ISO14001"));
  const hasIso27001 = hasCerts.some((c) => c.includes("ISO 27001") || c.includes("ISO27001"));
  const hasSoa = hasCerts.some((c) => c.includes("SOA"));
  const hasIso45001 = hasCerts.some((c) => c.includes("ISO 45001") || c.includes("ISO45001"));

  let score = 0;
  const details: string[] = [];

  if (hasIso9001) { score += 5; details.push("ISO 9001"); }
  if (hasIso14001) { score += 3; details.push("ISO 14001"); }
  if (hasIso27001) { score += 4; details.push("ISO 27001"); }
  if (hasSoa) { score += 5; details.push("SOA"); }
  if (hasIso45001) { score += 3; details.push("ISO 45001"); }

  // Bonus for additional certs
  const remaining = companyCerts.length - details.length;
  if (remaining > 0) {
    score += Math.min(remaining, 3);
  }

  score = Math.min(score, maxScore);

  if (score >= maxScore * 0.7) {
    return {
      name: "Certificazioni",
      score,
      maxScore,
      explanation: `Portafoglio certificazioni solido: ${details.join(", ")}`,
    };
  }

  const missing: string[] = [];
  if (!hasIso9001) missing.push("ISO 9001");
  if (!hasSoa && tender.contract_nature?.includes("works")) missing.push("SOA");
  if (!hasIso27001) missing.push("ISO 27001");

  return {
    name: "Certificazioni",
    score,
    maxScore,
    explanation:
      details.length > 0
        ? `Hai ${details.join(", ")}. Mancanti: ${missing.slice(0, 2).join(", ")}`
        : `Certificazioni mancanti: ${missing.join(", ")}`,
  };
}

// ============================================================================
// EXPERIENCE MATCH (0-10)
// ============================================================================

export function scoreExperienceMatch(
  tender: DbTender,
  profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 10;
  const years = profile.years_in_business;
  const employees = profile.employee_count;

  let score = 0;
  const parts: string[] = [];

  // Years in business
  if (years && years >= 10) {
    score += 5;
    parts.push(`${years} anni di esperienza`);
  } else if (years && years >= 5) {
    score += 3;
    parts.push(`${years} anni di esperienza`);
  } else if (years && years >= 2) {
    score += 1;
    parts.push(`${years} anni di esperienza`);
  }

  // Team size as capacity indicator
  if (employees && employees >= 50) {
    score += 5;
    parts.push(`team di ${employees} persone`);
  } else if (employees && employees >= 10) {
    score += 3;
    parts.push(`team di ${employees} persone`);
  } else if (employees) {
    score += 1;
    parts.push(`team di ${employees} persone`);
  }

  score = Math.min(score, maxScore);

  if (parts.length === 0) {
    return {
      name: "Esperienza",
      score: 0,
      maxScore,
      explanation: "Aggiungi anni di esperienza e numero dipendenti al profilo",
    };
  }

  return {
    name: "Esperienza",
    score,
    maxScore,
    explanation:
      score >= maxScore * 0.7
        ? `Esperienza solida: ${parts.join(", ")}`
        : `${parts.join(", ")} — profilo in crescita`,
  };
}

// ============================================================================
// DEADLINE FEASIBILITY (0-10)
// ============================================================================

export function scoreDeadlineFeasibility(
  tender: DbTender,
  _profile: DbCompanyProfile
): ScoreResult {
  const maxScore = 10;
  const deadline = tender.deadline;

  if (!deadline) {
    return {
      name: "Fattibilità scadenza",
      score: Math.round(maxScore * 0.5),
      maxScore,
      explanation: "Scadenza non specificata nel bando",
    };
  }

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const daysLeft = Math.ceil(
    (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysLeft < 0) {
    return {
      name: "Fattibilità scadenza",
      score: 0,
      maxScore,
      explanation: "Scadenza già superata",
    };
  }

  if (daysLeft <= 3) {
    return {
      name: "Fattibilità scadenza",
      score: 1,
      maxScore,
      explanation: `Solo ${daysLeft} giorni rimanenti — molto urgente`,
    };
  }

  if (daysLeft <= 7) {
    return {
      name: "Fattibilità scadenza",
      score: 4,
      maxScore,
      explanation: `${daysLeft} giorni rimanenti — preparazione rapida richiesta`,
    };
  }

  if (daysLeft <= 14) {
    return {
      name: "Fattibilità scadenza",
      score: 7,
      maxScore,
      explanation: `${daysLeft} giorni rimanenti — tempo sufficiente`,
    };
  }

  return {
    name: "Fattibilità scadenza",
    score: maxScore,
    maxScore,
    explanation: `${daysLeft} giorni rimanenti — tempo adeguato per la preparazione`,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatNum(n: number): string {
  return n.toLocaleString("it-IT");
}
