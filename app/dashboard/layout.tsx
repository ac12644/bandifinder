import { auth } from "@clerk/nextjs/server";

/**
 * Guards /dashboard.
 *
 * Replaces the `createRouteMatcher` entry that used to protect this segment
 * from the proxy. The check now sits on the segment it protects, so it cannot
 * drift out of sync with the route tree the way a path glob can.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  return <>{children}</>;
}
