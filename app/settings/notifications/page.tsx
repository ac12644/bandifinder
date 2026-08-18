"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { API_BASE_URL, ENDPOINTS } from "@/lib/apiConfig";

export default function NotificationSettingsPage() {
  const { uid, idToken } = useAuth();
  const [saving, setSaving] = useState(false);

  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [emailDigest, setEmailDigest] = useState("weekly");

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

    fetch(`${API_BASE_URL}${ENDPOINTS.preferences}`, {
      headers: headers(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((data) => {
        const p = data.preferences || {};
        if (p.notificationEmail !== undefined)
          setEmailEnabled(p.notificationEmail);
        if (p.notificationInApp !== undefined)
          setInAppEnabled(p.notificationInApp);
        if (p.emailDigest) setEmailDigest(p.emailDigest);
      })
      .catch(() => {});
  }, [uid, idToken, headers]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}${ENDPOINTS.preferences}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          notificationEmail: emailEnabled,
          notificationInApp: inAppEnabled,
          emailDigest,
        }),
      });
      toast.success("Preferenze aggiornate");
    } catch {
      toast.error("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canali di notifica</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Notifiche in-app</Label>
              <p className="text-xs text-muted-foreground">
                Mostra notifiche nella campanella
              </p>
            </div>
            <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Notifiche email</Label>
              <p className="text-xs text-muted-foreground">
                Ricevi aggiornamenti via email
              </p>
            </div>
            <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} />
          </div>

          {emailEnabled && (
            <div className="space-y-2">
              <Label>Frequenza digest email</Label>
              <Select value={emailDigest} onValueChange={setEmailDigest}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Giornaliero</SelectItem>
                  <SelectItem value="weekly">Settimanale</SelectItem>
                  <SelectItem value="never">Mai</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </div>
  );
}
