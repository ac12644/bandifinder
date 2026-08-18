"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ProfileCompletenessBar } from "@/components/onboarding/ProfileCompletenessBar";
import { X, Save, Info, Search, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";
import {
  CPV_CODES,
  PREDEFINED_SERVICES,
  PREDEFINED_CERTIFICATIONS,
  OPERATING_REGIONS,
  INDUSTRIES,
} from "@/lib/constants/profile-options";
import type { CpvOption } from "@/lib/constants/profile-options";

export default function SettingsProfilePage() {
  const { uid, idToken } = useAuth();
  const [saving, setSaving] = useState(false);
  const [completeness, setCompleteness] = useState(0);

  // Profile state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [industry, setIndustry] = useState("");
  const [annualRevenue, setAnnualRevenue] = useState("");
  const [employeeCount, setEmployeeCount] = useState("");
  const [website, setWebsite] = useState("");
  const [services, setServices] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [cpvCodes, setCpvCodes] = useState<string[]>([]);
  const [contractMin, setContractMin] = useState("");
  const [contractMax, setContractMax] = useState("");

  // UI state
  const [cpvSearch, setCpvSearch] = useState("");
  const [cpvOpen, setCpvOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [industryOpen, setIndustryOpen] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  const cpvRef = useRef<HTMLDivElement>(null);
  const industryRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      ...(uid ? { "x-user-id": uid } : {}),
    }),
    [idToken, uid]
  );

  useEffect(() => {
    if (!uid || !idToken) return;

    Promise.all([
      fetch(`${API_BASE_URL}${ENDPOINTS.companyProfile}`, {
        headers: headers(),
        cache: "no-store",
      }).then((r) => r.json()),
      fetch(`${API_BASE_URL}${ENDPOINTS.companyCompleteness}`, {
        headers: headers(),
        cache: "no-store",
      }).then((r) => r.json()),
    ])
      .then(([profileData, completenessData]) => {
        const p = profileData.profile || profileData;
        if (p.companyName) setCompanyName(p.companyName);
        if (p.description) setDescription(p.description);
        if (p.industry) setIndustry(p.industry);
        if (p.annualRevenue) setAnnualRevenue(String(p.annualRevenue));
        if (p.employeeCount) setEmployeeCount(String(p.employeeCount));
        if (p.website) setWebsite(p.website);
        if (p.services) setServices(p.services);
        if (p.certifications) setCertifications(p.certifications);
        if (p.operatingRegions) setRegions(p.operatingRegions);
        if (p.cpvCodes) setCpvCodes(p.cpvCodes);
        if (p.contractSizeMin) setContractMin(String(p.contractSizeMin));
        if (p.contractSizeMax) setContractMax(String(p.contractSizeMax));

        setCompleteness(
          completenessData.completeness?.score ?? completenessData.score ?? 0
        );
      })
      .catch(() => {});
  }, [uid, idToken, headers]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (cpvRef.current && !cpvRef.current.contains(e.target as Node))
        setCpvOpen(false);
      if (industryRef.current && !industryRef.current.contains(e.target as Node))
        setIndustryOpen(false);
      if (regionRef.current && !regionRef.current.contains(e.target as Node))
        setRegionOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}${ENDPOINTS.companyProfile}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          companyName,
          description,
          industry,
          annualRevenue: annualRevenue ? Number(annualRevenue) : undefined,
          employeeCount: employeeCount ? Number(employeeCount) : undefined,
          website,
          services,
          certifications,
          operatingRegions: regions,
          cpvCodes,
          contractSizeMin: contractMin ? Number(contractMin) : undefined,
          contractSizeMax: contractMax ? Number(contractMax) : undefined,
        }),
      });

      const res = await fetch(
        `${API_BASE_URL}${ENDPOINTS.companyCompleteness}`,
        { headers: headers(), cache: "no-store" }
      );
      if (res.ok) {
        const data = await res.json();
        setCompleteness(data.completeness?.score ?? data.score ?? 0);
      }

      toast.success("Profilo aggiornato");
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  // CPV search filtering
  const cpvResults = useMemo(() => {
    if (!cpvSearch.trim()) return CPV_CODES.slice(0, 12);
    const q = cpvSearch.toLowerCase();
    return CPV_CODES.filter(
      (c) => c.code.includes(q) || c.label.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [cpvSearch]);

  const toggleCpv = (code: string) => {
    setCpvCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const toggleService = (s: string) => {
    setServices((prev) =>
      prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]
    );
  };

  const toggleCert = (value: string) => {
    setCertifications((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleRegion = (code: string) => {
    setRegions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const filteredServices = useMemo(() => {
    if (!serviceSearch.trim()) return PREDEFINED_SERVICES;
    const q = serviceSearch.toLowerCase();
    return PREDEFINED_SERVICES.filter((s) => s.toLowerCase().includes(q));
  }, [serviceSearch]);

  const cpvLabel = (code: string): string => {
    const found = CPV_CODES.find((c) => c.code === code);
    return found ? found.label : code;
  };

  const regionLabel = (code: string): string => {
    const found = OPERATING_REGIONS.find((r) => r.code === code);
    return found ? found.label : code;
  };

  return (
    <div className="space-y-6">
      <ProfileCompletenessBar score={completeness} />

      {/* Company Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informazioni aziendali</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome azienda</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            {/* Industry dropdown */}
            <div className="space-y-2" ref={industryRef}>
              <Label>Settore</Label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIndustryOpen(!industryOpen)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:bg-accent"
                >
                  <span className={industry ? "" : "text-muted-foreground"}>
                    {industry || "Seleziona settore..."}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </button>
                {industryOpen && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
                    {INDUSTRIES.map((ind) => (
                      <button
                        key={ind}
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                        onClick={() => {
                          setIndustry(ind);
                          setIndustryOpen(false);
                        }}
                      >
                        {industry === ind && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                        <span className={industry === ind ? "font-medium" : ""}>
                          {ind}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Fatturato annuo (EUR)</Label>
              <Input
                type="number"
                value={annualRevenue}
                onChange={(e) => setAnnualRevenue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Dipendenti</Label>
              <Input
                type="number"
                value={employeeCount}
                onChange={(e) => setEmployeeCount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Sito web</Label>
              <Input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* CPV Codes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Codici CPV
            <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
              <Info className="h-3 w-3" />
              Classificazione settore gare
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Selected CPV badges */}
          {cpvCodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cpvCodes.map((code) => (
                <Badge
                  key={code}
                  variant="secondary"
                  className="gap-1 text-xs"
                >
                  {cpvLabel(code)}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => toggleCpv(code)}
                  />
                </Badge>
              ))}
            </div>
          )}

          {/* CPV search */}
          <div className="relative" ref={cpvRef}>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={cpvSearch}
                onChange={(e) => {
                  setCpvSearch(e.target.value);
                  setCpvOpen(true);
                }}
                onFocus={() => setCpvOpen(true)}
                placeholder="Cerca per codice o descrizione..."
                className="pl-8"
              />
            </div>
            {cpvOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-64 overflow-y-auto">
                {cpvResults.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    Nessun risultato
                  </div>
                ) : (
                  cpvResults.map((cpv: CpvOption) => {
                    const selected = cpvCodes.includes(cpv.code);
                    return (
                      <button
                        key={cpv.code}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                          selected ? "bg-accent/50" : ""
                        }`}
                        onClick={() => toggleCpv(cpv.code)}
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                        <span className="font-mono text-xs text-muted-foreground">
                          {cpv.code}
                        </span>
                        <span className="truncate">
                          {cpv.label.split(" - ")[1] || cpv.label}
                        </span>
                      </button>
                    );
                  })
                )}
                {cpvSearch.trim() &&
                  !CPV_CODES.some((c) => c.code === cpvSearch.trim()) &&
                  /^\d{8}$/.test(cpvSearch.trim()) && (
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left border-t"
                      onClick={() => {
                        toggleCpv(cpvSearch.trim());
                        setCpvSearch("");
                      }}
                    >
                      <span className="text-primary">+</span>
                      Aggiungi codice personalizzato: {cpvSearch.trim()}
                    </button>
                  )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Services & Certifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Competenze e certificazioni
            <span className="text-xs text-muted-foreground font-normal flex items-center gap-1">
              <Info className="h-3 w-3" />
              Usato per valutare idoneità
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Services — searchable chip grid */}
          <div className="space-y-2">
            <Label>Servizi offerti</Label>
            <Input
              value={serviceSearch}
              onChange={(e) => setServiceSearch(e.target.value)}
              placeholder="Filtra servizi..."
              className="mb-2"
            />
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {filteredServices.map((s) => {
                const selected = services.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleService(s)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent border-border"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {s}
                  </button>
                );
              })}
            </div>
            {/* Custom service input */}
            {serviceSearch.trim() &&
              !PREDEFINED_SERVICES.some(
                (s) => s.toLowerCase() === serviceSearch.trim().toLowerCase()
              ) && (
                <button
                  type="button"
                  className="text-xs text-primary hover:underline mt-1"
                  onClick={() => {
                    const val = serviceSearch.trim();
                    if (!services.includes(val)) {
                      setServices([...services, val]);
                    }
                    setServiceSearch("");
                  }}
                >
                  + Aggiungi &quot;{serviceSearch.trim()}&quot; come servizio
                  personalizzato
                </button>
              )}
            {/* Show custom services not in predefined list */}
            {services.filter((s) => !PREDEFINED_SERVICES.includes(s)).length >
              0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t mt-2">
                {services
                  .filter((s) => !PREDEFINED_SERVICES.includes(s))
                  .map((s) => (
                    <Badge key={s} variant="outline" className="gap-1 text-xs">
                      {s}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => toggleService(s)}
                      />
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          {/* Certifications — clickable chips */}
          <div className="space-y-2">
            <Label>Certificazioni</Label>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_CERTIFICATIONS.map((cert) => {
                const selected = certifications.includes(cert.value);
                return (
                  <button
                    key={cert.value}
                    type="button"
                    onClick={() => toggleCert(cert.value)}
                    title={cert.description}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-accent border-border"
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {cert.label}
                    <span
                      className={`${
                        selected
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground"
                      } hidden sm:inline`}
                    >
                      — {cert.description}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Show custom certs not in predefined list */}
            {certifications.filter(
              (c) => !PREDEFINED_CERTIFICATIONS.some((p) => p.value === c)
            ).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t mt-2">
                {certifications
                  .filter(
                    (c) =>
                      !PREDEFINED_CERTIFICATIONS.some((p) => p.value === c)
                  )
                  .map((c) => (
                    <Badge key={c} variant="outline" className="gap-1 text-xs">
                      {c}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-destructive"
                        onClick={() => toggleCert(c)}
                      />
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          {/* Operating Regions */}
          <div className="space-y-2" ref={regionRef}>
            <Label>Regioni operative</Label>
            {regions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {regions.map((code) => (
                  <Badge
                    key={code}
                    variant="secondary"
                    className="gap-1 text-xs"
                  >
                    {regionLabel(code)}
                    <X
                      className="h-3 w-3 cursor-pointer hover:text-destructive"
                      onClick={() => toggleRegion(code)}
                    />
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setRegionOpen(!regionOpen)}
                className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors hover:bg-accent"
              >
                <span className="text-muted-foreground">
                  {regions.length === 0
                    ? "Seleziona paesi..."
                    : `${regions.length} selezionati`}
                </span>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </button>
              {regionOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg max-h-56 overflow-y-auto">
                  {OPERATING_REGIONS.map((reg) => {
                    const selected = regions.includes(reg.code);
                    return (
                      <button
                        key={reg.code}
                        type="button"
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left ${
                          selected ? "bg-accent/50" : ""
                        }`}
                        onClick={() => toggleRegion(reg.code)}
                      >
                        <div
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            selected
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                        </div>
                        {reg.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Contract size range */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Contratto min (EUR)</Label>
              <Input
                type="number"
                value={contractMin}
                onChange={(e) => setContractMin(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Contratto max (EUR)</Label>
              <Input
                type="number"
                value={contractMax}
                onChange={(e) => setContractMax(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvataggio..." : "Salva profilo"}
        </Button>
      </div>
    </div>
  );
}
