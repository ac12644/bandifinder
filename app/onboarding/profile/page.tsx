"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { ProfileCompletenessBar } from "@/components/onboarding/ProfileCompletenessBar";
import { ArrowLeft, ArrowRight, X, Info } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

const STEPS = [
  { label: "Azienda" },
  { label: "Profilo" },
  { label: "Completato" },
];

const PROFILE_STEPS = [
  "Servizi e competenze",
  "Certificazioni",
  "Regioni operative",
  "Dimensioni contratti",
  "Esperienza",
];

const COMMON_CERTS = [
  "ISO 9001",
  "ISO 14001",
  "ISO 27001",
  "ISO 45001",
  "SOA",
  "RINA",
  "Antimafia",
];

const IT_REGIONS = [
  "ITA",
  "DEU",
  "FRA",
  "ESP",
  "BEL",
  "NLD",
  "AUT",
  "POL",
  "ROU",
  "PRT",
];

export default function OnboardingProfilePage() {
  const router = useRouter();
  const { uid, idToken } = useAuth();
  const [step, setStep] = useState(0);
  const [completeness, setCompleteness] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Profile fields
  const [services, setServices] = useState<string[]>([]);
  const [serviceInput, setServiceInput] = useState("");
  const [certifications, setCertifications] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [contractMin, setContractMin] = useState("");
  const [contractMax, setContractMax] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [cpvCodes, setCpvCodes] = useState<string[]>([]);
  const [cpvInput, setCpvInput] = useState("");

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(uid ? { "x-user-id": uid } : {}),
    }),
    [idToken, uid]
  );

  // Load existing profile
  useEffect(() => {
    if (!uid || !idToken) return;

    fetch(`${API_BASE_URL}${ENDPOINTS.companyProfile}`, {
      headers: headers(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        const p = data.profile || data;
        if (p.services) setServices(p.services);
        if (p.certifications) setCertifications(p.certifications);
        if (p.operatingRegions) setRegions(p.operatingRegions);
        if (p.contractSizeMin) setContractMin(String(p.contractSizeMin));
        if (p.contractSizeMax) setContractMax(String(p.contractSizeMax));
        if (p.annualRevenue) setAnnualRevenue(String(p.annualRevenue));
        if (p.yearsInBusiness) setYearsInBusiness(String(p.yearsInBusiness));
        if (p.cpvCodes) setCpvCodes(p.cpvCodes);
      })
      .catch(() => {});
  }, [uid, idToken, headers]);

  // Check completeness after each save
  const checkCompleteness = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE_URL}${ENDPOINTS.companyCompleteness}`,
        { headers: headers(), cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setCompleteness(data.completeness?.score ?? data.score ?? 0);
      }
    } catch {}
  }, [headers]);

  const saveProfile = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}${ENDPOINTS.companyProfile}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          services,
          certifications,
          operatingRegions: regions,
          contractSizeMin: contractMin ? Number(contractMin) : undefined,
          contractSizeMax: contractMax ? Number(contractMax) : undefined,
          annualRevenue: annualRevenue ? Number(annualRevenue) : undefined,
          yearsInBusiness: yearsInBusiness
            ? Number(yearsInBusiness)
            : undefined,
          cpvCodes,
        }),
      });
      await checkCompleteness();
    } catch {}
  }, [
    services,
    certifications,
    regions,
    contractMin,
    contractMax,
    annualRevenue,
    yearsInBusiness,
    cpvCodes,
    headers,
    checkCompleteness,
  ]);

  const addTag = (
    value: string,
    list: string[],
    setter: (v: string[]) => void,
    inputSetter: (v: string) => void
  ) => {
    const trimmed = value.trim();
    if (trimmed && !list.includes(trimmed)) {
      setter([...list, trimmed]);
    }
    inputSetter("");
  };

  const removeTag = (
    value: string,
    list: string[],
    setter: (v: string[]) => void
  ) => {
    setter(list.filter((v) => v !== value));
  };

  const toggleTag = (
    value: string,
    list: string[],
    setter: (v: string[]) => void
  ) => {
    if (list.includes(value)) {
      setter(list.filter((v) => v !== value));
    } else {
      setter([...list, value]);
    }
  };

  const handleNext = async () => {
    setSubmitting(true);
    await saveProfile();
    setSubmitting(false);

    if (step < PROFILE_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      // Final step — check if ready
      if (completeness >= 80) {
        router.push("/onboarding/complete");
      } else {
        toast.info(
          "Completa almeno l'80% del profilo per continuare. Aggiungi i campi mancanti."
        );
      }
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  return (
    <div className="space-y-6">
      <OnboardingStepper steps={STEPS} currentStep={1} />

      <ProfileCompletenessBar score={completeness} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {PROFILE_STEPS[step]}
          </CardTitle>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Info className="h-3.5 w-3.5" />
            Usato per valutare la tua idoneità ai bandi
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Step 0: Services */}
          {step === 0 && (
            <div className="space-y-3">
              <Label>Servizi offerti</Label>
              <div className="flex gap-2">
                <Input
                  value={serviceInput}
                  onChange={(e) => setServiceInput(e.target.value)}
                  placeholder="Es. Sviluppo software"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(serviceInput, services, setServices, setServiceInput);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    addTag(serviceInput, services, setServices, setServiceInput)
                  }
                >
                  Aggiungi
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeTag(s, services, setServices)}
                    />
                  </Badge>
                ))}
              </div>

              <Label className="mt-4">Codici CPV</Label>
              <div className="flex gap-2">
                <Input
                  value={cpvInput}
                  onChange={(e) => setCpvInput(e.target.value)}
                  placeholder="Es. 72000000"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag(cpvInput, cpvCodes, setCpvCodes, setCpvInput);
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    addTag(cpvInput, cpvCodes, setCpvCodes, setCpvInput)
                  }
                >
                  Aggiungi
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {cpvCodes.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1">
                    {c}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeTag(c, cpvCodes, setCpvCodes)}
                    />
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Certifications */}
          {step === 1 && (
            <div className="space-y-3">
              <Label>Certificazioni</Label>
              <div className="flex flex-wrap gap-2">
                {COMMON_CERTS.map((cert) => (
                  <Badge
                    key={cert}
                    variant={
                      certifications.includes(cert) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() =>
                      toggleTag(cert, certifications, setCertifications)
                    }
                  >
                    {cert}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Clicca per selezionare/deselezionare
              </p>
            </div>
          )}

          {/* Step 2: Regions */}
          {step === 2 && (
            <div className="space-y-3">
              <Label>Regioni operative (codici paese)</Label>
              <div className="flex flex-wrap gap-2">
                {IT_REGIONS.map((region) => (
                  <Badge
                    key={region}
                    variant={regions.includes(region) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleTag(region, regions, setRegions)}
                  >
                    {region}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Contract size */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valore minimo contratto (EUR)</Label>
                  <Input
                    type="number"
                    value={contractMin}
                    onChange={(e) => setContractMin(e.target.value)}
                    placeholder="50.000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valore massimo contratto (EUR)</Label>
                  <Input
                    type="number"
                    value={contractMax}
                    onChange={(e) => setContractMax(e.target.value)}
                    placeholder="5.000.000"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Fatturato annuo (EUR)</Label>
                <Input
                  type="number"
                  value={annualRevenue}
                  onChange={(e) => setAnnualRevenue(e.target.value)}
                  placeholder="1.000.000"
                />
              </div>
            </div>
          )}

          {/* Step 4: Experience */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Anni di attività</Label>
                <Input
                  type="number"
                  value={yearsInBusiness}
                  onChange={(e) => setYearsInBusiness(e.target.value)}
                  placeholder="10"
                />
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-4">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Indietro
            </Button>
            <span className="text-xs text-muted-foreground">
              {step + 1} / {PROFILE_STEPS.length}
            </span>
            <Button onClick={handleNext} disabled={submitting}>
              {submitting
                ? "Salvataggio..."
                : step === PROFILE_STEPS.length - 1
                  ? "Completa"
                  : "Avanti"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
