"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";
import { CheckCircle2, ArrowRight } from "lucide-react";

const STEPS = [
  { label: "Azienda" },
  { label: "Profilo" },
  { label: "Completato" },
];

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <OnboardingStepper steps={STEPS} currentStep={3} />

      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>

          <h2 className="text-xl font-semibold">Tutto pronto!</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Il tuo profilo è completo. Ora Bandifinder può trovare i bandi
            più adatti alla tua azienda.
          </p>

          <Button
            size="lg"
            className="mt-4"
            onClick={() => router.push("/dashboard")}
          >
            Vai alla Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
