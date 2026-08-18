"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { Building2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const STEPS = [
  { label: "Azienda" },
  { label: "Profilo" },
  { label: "Completato" },
];

const INDUSTRIES = [
  "Tecnologia e IT",
  "Costruzioni e Ingegneria",
  "Sanità e Farmaceutica",
  "Consulenza e Servizi",
  "Trasporti e Logistica",
  "Energia e Ambiente",
  "Formazione e Istruzione",
  "Comunicazione e Media",
  "Sicurezza",
  "Alimentare",
  "Altro",
];

const SIZES = [
  { value: "1-10", label: "1-10 dipendenti" },
  { value: "11-50", label: "11-50 dipendenti" },
  { value: "51-250", label: "51-250 dipendenti" },
  { value: "250+", label: "Oltre 250 dipendenti" },
];

export default function OnboardingOrganizationPage() {
  const router = useRouter();
  const { createOrganization, isLoaded } = useOrganizationList();

  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("");
  const [country, setCountry] = useState("IT");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Inserisci il nome dell'azienda");
      return;
    }

    if (!createOrganization || !isLoaded) return;

    setSubmitting(true);
    try {
      await createOrganization({
        name: name.trim(),
      });

      // The Clerk webhook will create the org in Supabase.
      // Small delay to let webhook propagate.
      await new Promise((r) => setTimeout(r, 1000));

      router.push("/onboarding/profile");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Errore nella creazione"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <OnboardingStepper steps={STEPS} currentStep={0} />

      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Crea la tua organizzazione</CardTitle>
          <p className="text-sm text-muted-foreground">
            Inizia configurando la tua azienda per ricevere bandi personalizzati.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome azienda *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Es. Acme Solutions S.r.l."
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Paese</Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IT">Italia</SelectItem>
                  <SelectItem value="DE">Germania</SelectItem>
                  <SelectItem value="FR">Francia</SelectItem>
                  <SelectItem value="ES">Spagna</SelectItem>
                  <SelectItem value="OTHER">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Settore</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona settore" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="size">Dimensione azienda</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona dimensione" />
                </SelectTrigger>
                <SelectContent>
                  {SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Creazione in corso..." : "Continua"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
