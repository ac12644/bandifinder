import { auth } from "@clerk/nextjs/server";

/**
 * Server-side authenticated fetch using Clerk.
 * Use this in Server Components and API routes.
 */
export async function authedFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}

/**
 * Client-side authenticated fetch helper.
 * Pass the token from useAuth().getToken()
 */
export async function clientAuthedFetch<T>(
  url: string,
  token: string | null,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) throw new Error(await res.text());
  return (await res.json()) as T;
}
