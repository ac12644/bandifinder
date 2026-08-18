"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, UserPlus, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOrganization, useOrganizationList } from "@clerk/nextjs";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  "org:admin": { label: "Admin", color: "bg-blue-100 text-blue-700" },
  "org:member": { label: "Membro", color: "bg-gray-100 text-gray-700" },
  admin: { label: "Admin", color: "bg-blue-100 text-blue-700" },
  member: { label: "Membro", color: "bg-gray-100 text-gray-700" },
};

export default function TeamPage() {
  const { organization, memberships, isLoaded } = useOrganization({
    memberships: { infinite: true },
  });

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">
          Nessuna organizzazione trovata. Crea un&apos;organizzazione per
          gestire il team.
        </p>
      </div>
    );
  }

  const memberList = memberships?.data || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team — {organization.name}
            </CardTitle>
            <Button
              size="sm"
              onClick={() => {
                // Clerk's built-in invite modal
                if (organization) {
                  window.open(
                    `https://clerk.com`,
                    "_blank"
                  );
                }
              }}
              variant="outline"
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Invita
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {memberList.length} membr{memberList.length === 1 ? "o" : "i"}
          </p>
        </CardHeader>
        <CardContent>
          {memberList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun membro nel team
            </p>
          ) : (
            <div className="divide-y">
              {memberList.map((member) => {
                const roleConf =
                  ROLE_LABELS[member.role] || ROLE_LABELS["member"];
                const user = member.publicUserData;

                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      {user?.imageUrl ? (
                        <img
                          src={user.imageUrl}
                          alt=""
                          className="h-8 w-8 rounded-full"
                        />
                      ) : (
                        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-medium">
                          {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user?.identifier}
                        </p>
                      </div>
                    </div>

                    <Badge variant="outline" className={roleConf.color}>
                      {member.role === "org:admin" && (
                        <Shield className="h-3 w-3 mr-1" />
                      )}
                      {roleConf.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/30">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            Per invitare membri al team, gestire i ruoli e le autorizzazioni,
            utilizza il pannello organizzazione di Clerk accessibile dal menu
            utente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
