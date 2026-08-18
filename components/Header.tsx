"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/UserMenu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  Search,
  BarChart3,
  Settings,
  Menu,
  Sparkles,
  MessageSquare,
  Kanban,
  TrendingUp,
  Shield,
  ChevronRight,
} from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { cn } from "@/lib/utils";
import { useState, type ComponentType } from "react";

// Set NEXT_PUBLIC_ADMIN_UID to enable the admin surfaces. Left unset, nothing
// admin renders — this only gates UI; the real check is adminMiddleware on the
// server. Deliberately has no fallback so a real user id is not shipped to
// every visitor in the client bundle.
const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID;

// ============================================================================
// NAV CONFIG
// ============================================================================

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  description: string;
  requiresAuth?: boolean;
  adminOnly?: boolean;
  badge?: string;
}

const primaryNav: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: BarChart3,
    description: "Panoramica e bandi consigliati",
    requiresAuth: true,
  },
  {
    // Open to guests: browsing tenders is how the product demonstrates itself.
    href: "/tenders",
    label: "Bandi",
    icon: Search,
    description: "Cerca e scopri bandi pubblici",
  },
  {
    href: "/pipeline",
    label: "Pipeline",
    icon: Kanban,
    description: "Gestisci le candidature",
    requiresAuth: true,
  },
  {
    href: "/analytics",
    label: "Analisi",
    icon: TrendingUp,
    description: "Win/loss e intelligence competitiva",
  },
];

const secondaryNav: NavItem[] = [
  {
    href: "/",
    label: "Chat AI",
    icon: MessageSquare,
    description: "Assistente AI per bandi",
    badge: "AI",
  },
  {
    href: "/settings",
    label: "Impostazioni",
    icon: Settings,
    description: "Profilo, notifiche, team e fatturazione",
    requiresAuth: true,
  },
  {
    href: "/admin",
    label: "Admin",
    icon: Shield,
    description: "Pannello amministrazione",
    adminOnly: true,
  },
];

// ============================================================================
// HEADER
// ============================================================================

export function Header() {
  const { isSignedIn, userId } = useAuth();
  const { user } = useUser();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname.startsWith("/onboarding")) return null;

  const isAdmin =
    (Boolean(ADMIN_UID) && userId === ADMIN_UID) ||
    user?.publicMetadata?.role === "admin" ||
    user?.organizationMemberships?.some((m) => m.role === "org:admin");

  const canShow = (item: NavItem) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.requiresAuth && !isSignedIn) return false;
    return true;
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const visiblePrimary = primaryNav.filter(canShow);
  const visibleSecondary = secondaryNav.filter(canShow);
  const allMobile = [...visiblePrimary, ...visibleSecondary];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center px-4 sm:px-6 lg:px-8">
        {/* ── Logo ── */}
        <Link
          href={isSignedIn ? "/dashboard" : "/"}
          className="flex items-center gap-2 mr-6 shrink-0 group"
        >
          <div className="relative">
            <Bot className="h-6 w-6 text-primary transition-transform group-hover:scale-110" />
            <Sparkles className="absolute -top-1 -right-1 h-2.5 w-2.5 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <span className="hidden sm:block font-bold text-base tracking-tight">
            Bandifinder<span className="text-muted-foreground font-normal">.it</span>
          </span>
        </Link>

        {/* ── Desktop Nav ── */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1">
          {visiblePrimary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {active && (
                  <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full translate-y-[11px]" />
                )}
              </Link>
            );
          })}

          {/* Chat AI with badge — visually distinct */}
          {visibleSecondary
            .filter((i) => i.href === "/")
            .map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ml-1",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1 text-[9px] font-semibold bg-primary/10 text-primary border-0"
                    >
                      {item.badge}
                    </Badge>
                  )}
                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full translate-y-[11px]" />
                  )}
                </Link>
              );
            })}
        </nav>

        {/* ── Right Actions ── */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Settings — icon-only on desktop */}
          {isSignedIn && (
            <Link
              href="/settings"
              className={cn(
                "hidden md:flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                isActive("/settings")
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">Impostazioni</span>
            </Link>
          )}

          {/* Admin — icon-only on desktop */}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "hidden md:flex items-center justify-center h-8 w-8 rounded-md transition-colors",
                isActive("/admin")
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Shield className="h-4 w-4" />
              <span className="sr-only">Admin</span>
            </Link>
          )}

          {/* Notifications */}
          {isSignedIn && <NotificationBell />}

          <Separator orientation="vertical" className="hidden md:block h-5 mx-1" />

          {/* User / Sign In */}
          <UserMenu />

          {/* ── Mobile Hamburger ── */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Apri menu</span>
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-[300px] p-0">
              <SheetHeader className="px-4 pt-4 pb-3">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-5 w-5 text-primary" />
                  Bandifinder
                </SheetTitle>
              </SheetHeader>

              <Separator />

              <div className="py-2">
                {/* Primary Nav */}
                <div className="px-2 pb-1">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Navigazione
                  </p>
                  {visiblePrimary.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg mx-1 transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
                            active
                              ? "bg-primary/15"
                              : "bg-muted"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-[11px] text-muted-foreground leading-tight truncate">
                            {item.description}
                          </p>
                        </div>
                        {active && (
                          <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </Link>
                    );
                  })}
                </div>

                <Separator className="my-2" />

                {/* Secondary Nav */}
                <div className="px-2">
                  <p className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Altro
                  </p>
                  {visibleSecondary.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg mx-1 transition-colors",
                          active
                            ? "bg-primary/10 text-primary"
                            : "text-foreground hover:bg-accent"
                        )}
                      >
                        <div
                          className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-lg shrink-0",
                            active
                              ? "bg-primary/15"
                              : "bg-muted"
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium">{item.label}</p>
                            {item.badge && (
                              <Badge
                                variant="secondary"
                                className="h-4 px-1 text-[9px] font-semibold bg-primary/10 text-primary border-0"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-tight truncate">
                            {item.description}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {!isSignedIn && (
                  <>
                    <Separator className="my-2" />
                    <div className="mx-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                      <p className="text-sm font-medium">
                        Accedi per più funzionalità
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Sblocca dashboard, bandi personalizzati e molto altro.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
