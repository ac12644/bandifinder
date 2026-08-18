"use client";

import * as React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  CPV_CODES,
  OPERATING_REGIONS,
  PREDEFINED_CERTIFICATIONS,
} from "@/lib/constants/profile-options";
import {
  getGuestProfile,
  saveGuestProfile,
  type GuestProfile,
} from "@/lib/guestSession";

/**
 * Inline company profile for visitors without an account.
 *
 * The scoring engine needs a profile to produce anything meaningful — with
 * none, every component scores zero and the product looks broken to exactly
 * the audience we're trying to convince. This collects the three fields that
 * carry the most weight (CPV 25, geography 15, economic fit 20) without
 * asking anyone to sign up.
 *
 * Stored in localStorage only; nothing is persisted server-side until the
 * visitor creates an account.
 */
export function GuestProfileDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (profile: GuestProfile) => void;
}) {
  const existing = getGuestProfile();

  const [cpvCodes, setCpvCodes] = useState<string[]>(existing?.cpvCodes ?? []);
  const [regions, setRegions] = useState<string[]>(
    existing?.operatingRegions ?? []
  );
  const [revenue, setRevenue] = useState<string>(
    existing?.annualRevenue != null ? String(existing.annualRevenue) : ""
  );
  const [certifications, setCertifications] = useState<string[]>(
    existing?.certifications ?? []
  );
  const [cpvQuery, setCpvQuery] = useState("");

  const cpvMatches = cpvQuery.trim()
    ? CPV_CODES.filter(
        (o) =>
          !cpvCodes.includes(o.code) &&
          o.label.toLowerCase().includes(cpvQuery.trim().toLowerCase())
      ).slice(0, 6)
    : [];

  const labelForCpv = (code: string) =>
    CPV_CODES.find((o) => o.code === code)?.label ?? code;

  function toggle(
    value: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    setter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function handleSave() {
    const parsedRevenue = revenue.trim() ? Number(revenue) : null;

    const profile: GuestProfile = {
      cpvCodes,
      operatingRegions: regions.length > 0 ? regions : ["ITA"],
      certifications,
      annualRevenue:
        parsedRevenue != null && Number.isFinite(parsedRevenue)
          ? parsedRevenue
          : null,
    };

    saveGuestProfile(profile);
    onSaved?.(profile);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raccontaci della tua azienda</DialogTitle>
          <DialogDescription>
            Bastano pochi dati per calcolare la compatibilità reale tra la tua
            azienda e ogni bando. Nessuna registrazione richiesta — i dati
            restano su questo dispositivo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* CPV — the heaviest scoring component (25/100) */}
          <div className="space-y-2">
            <Label htmlFor="guest-cpv">Settore di attività</Label>
            <Input
              id="guest-cpv"
              value={cpvQuery}
              onChange={(e) => setCpvQuery(e.target.value)}
              placeholder="Es. servizi informatici, costruzioni, pulizie…"
              autoComplete="off"
            />

            {cpvMatches.length > 0 && (
              <div className="rounded-md border divide-y">
                {cpvMatches.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => {
                      setCpvCodes((prev) => [...prev, option.code]);
                      setCpvQuery("");
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {cpvCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {cpvCodes.map((code) => (
                  <Badge key={code} variant="secondary" className="gap-1">
                    <span className="max-w-[220px] truncate">
                      {labelForCpv(code)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Rimuovi ${labelForCpv(code)}`}
                      onClick={() =>
                        setCpvCodes((prev) => prev.filter((c) => c !== code))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Geography (15/100) */}
          <div className="space-y-2">
            <Label>Regioni in cui operi</Label>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
              {OPERATING_REGIONS.slice(0, 12).map((region) => (
                <Badge
                  key={region.code}
                  variant={
                    regions.includes(region.code) ? "default" : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => toggle(region.code, setRegions)}
                >
                  {region.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Certifications (20/100) */}
          <div className="space-y-2">
            <Label>Certificazioni</Label>
            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_CERTIFICATIONS.slice(0, 8).map((cert) => (
                <Badge
                  key={cert.value}
                  variant={
                    certifications.includes(cert.value) ? "default" : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => toggle(cert.value, setCertifications)}
                  title={cert.description}
                >
                  {cert.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Economic fit (20/100) */}
          <div className="space-y-2">
            <Label htmlFor="guest-revenue">Fatturato annuo (€)</Label>
            <Input
              id="guest-revenue"
              type="number"
              min={0}
              value={revenue}
              onChange={(e) => setRevenue(e.target.value)}
              placeholder="Es. 500000"
            />
            <p className="text-xs text-muted-foreground">
              Serve a capire quali importi di gara sono sostenibili per te.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Più tardi
          </Button>
          <Button onClick={handleSave} disabled={cpvCodes.length === 0}>
            Calcola compatibilità
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
