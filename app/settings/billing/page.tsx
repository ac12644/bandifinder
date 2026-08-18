"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  XCircle,
  CreditCard,
  Loader2,
  ExternalLink,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  useBilling,
  usePlans,
  useCheckout,
  usePortal,
  type PlanInfo,
} from "@/lib/hooks/useBilling";

const PLAN_FEATURES: Record<string, string[]> = {
  free: [
    "5 ricerche al giorno",
    "10 preferiti",
    "1 utente",
    "3 gare attive",
    "Solo TED",
  ],
  starter: [
    "50 ricerche al giorno",
    "Preferiti illimitati",
    "3 utenti",
    "20 gare attive",
    "Pipeline gare",
    "Esportazione",
  ],
  pro: [
    "Ricerche illimitate",
    "Preferiti illimitati",
    "10 utenti",
    "Gare illimitate",
    "Pipeline gare",
    "Esportazione",
    "Accesso API",
    "Fonti multiple (TED + ANAC)",
  ],
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function PlanCard({
  plan,
  isCurrent,
  onUpgrade,
  upgrading,
}: {
  plan: PlanInfo;
  isCurrent: boolean;
  onUpgrade: (planId: string) => void;
  upgrading: boolean;
}) {
  const features = PLAN_FEATURES[plan.id] || [];

  return (
    <Card className={isCurrent ? "border-primary" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          {isCurrent && (
            <Badge className="bg-primary text-primary-foreground">
              Piano attuale
            </Badge>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          {plan.price === 0 ? (
            <span className="text-2xl font-bold">Gratis</span>
          ) : (
            <>
              <span className="text-2xl font-bold">
                &euro;{plan.price}
              </span>
              <span className="text-sm text-muted-foreground">/mese</span>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              {f}
            </li>
          ))}
        </ul>

        {!isCurrent && plan.price > 0 && (
          <Button
            className="w-full mt-2"
            onClick={() => onUpgrade(plan.id)}
            disabled={upgrading}
          >
            {upgrading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Zap className="h-4 w-4 mr-2" />
            )}
            Passa a {plan.name}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const searchParams = useSearchParams();
  const { data: billing, isLoading } = useBilling();
  const { data: plansData } = usePlans();
  const checkout = useCheckout();
  const portal = usePortal();

  // Show success/cancel messages from Stripe redirect
  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  const handleUpgrade = (planId: string) => {
    checkout.mutate(
      { planId },
      {
        onSuccess: (data) => {
          if (data.url) {
            window.location.href = data.url;
          }
        },
        onError: () => toast.error("Errore nella creazione del checkout"),
      }
    );
  };

  const handleManage = () => {
    portal.mutate(undefined, {
      onSuccess: (data) => {
        if (data.url) {
          window.location.href = data.url;
        }
      },
      onError: () => toast.error("Errore nell'apertura del portale"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentPlan = billing?.plan;
  const subscription = billing?.subscription;

  return (
    <div className="space-y-6">
      {/* Success/cancel banners */}
      {success && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">
              Abbonamento attivato con successo!
            </p>
          </div>
        </div>
      )}
      {canceled && (
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
          <p className="text-sm text-yellow-800">
            Checkout annullato. Il tuo piano non è stato modificato.
          </p>
        </div>
      )}

      {/* Current plan info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Abbonamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                Piano {currentPlan?.name || "Free"}
              </p>
              {subscription ? (
                <p className="text-sm text-muted-foreground">
                  {subscription.cancelAtPeriodEnd
                    ? `Scade il ${formatDate(subscription.currentPeriodEnd)}`
                    : `Rinnovo il ${formatDate(subscription.currentPeriodEnd)}`}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nessun abbonamento attivo
                </p>
              )}
            </div>

            {subscription && (
              <Badge
                variant={
                  subscription.status === "active" ? "default" : "secondary"
                }
              >
                {subscription.status === "active"
                  ? "Attivo"
                  : subscription.status === "past_due"
                    ? "Pagamento in sospeso"
                    : subscription.status}
              </Badge>
            )}
          </div>

          {subscription?.cancelAtPeriodEnd && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
              <p className="text-sm text-yellow-800">
                L&apos;abbonamento non verrà rinnovato. Tornerai al piano Free
                alla scadenza.
              </p>
            </div>
          )}

          {billing?.hasCustomer && (
            <Button variant="outline" onClick={handleManage} disabled={portal.isPending}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Gestisci fatturazione
            </Button>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Plans comparison */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Piani disponibili</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(plansData?.plans || []).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={currentPlan?.id === plan.id}
              onUpgrade={handleUpgrade}
              upgrading={checkout.isPending}
            />
          ))}
        </div>
      </div>

      {/* Enterprise CTA */}
      <Card className="bg-muted/30">
        <CardContent className="flex items-center justify-between py-6">
          <div>
            <p className="font-medium">Piano Enterprise</p>
            <p className="text-sm text-muted-foreground">
              SLA dedicato, ingestion personalizzata, supporto prioritario
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="mailto:info@bandifinder.it">Contattaci</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
