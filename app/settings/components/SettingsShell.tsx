"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Bell, CreditCard, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/settings/profile", label: "Profilo", Icon: User },
  { href: "/settings/notifications", label: "Notifiche", Icon: Bell },
  { href: "/settings/billing", label: "Abbonamento", Icon: CreditCard },
  { href: "/settings/team", label: "Team", Icon: Users },
];

/**
 * The settings chrome: sidebar nav plus content well.
 *
 * Split out of `layout.tsx` so that file can be a server component and call
 * `auth.protect()`. This half needs `usePathname` to highlight the active tab,
 * so it stays on the client.
 */
export function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold mb-6">Impostazioni</h1>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Sidebar nav */}
        <nav className="flex sm:flex-col gap-1 sm:w-48 shrink-0">
          {NAV_ITEMS.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                pathname === href
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
