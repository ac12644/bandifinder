"use client";

import { useQuery, useMutation, UseQueryOptions, UseMutationOptions } from "@tanstack/react-query";
import { useAuth } from "@/components/AuthProvider";
import { API_BASE_URL } from "@/lib/apiConfig";
import { guestHeaders } from "@/lib/guestSession";
import { toast } from "sonner";

/**
 * Authenticated fetch for use with TanStack Query.
 * Automatically attaches Clerk JWT and user ID headers.
 */
/** Thrown when an action needs a real account. Lets callers show a prompt. */
export class AccountRequiredError extends Error {
  readonly code = "ACCOUNT_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "AccountRequiredError";
  }
}

async function fetchWithAuth<T>(
  url: string,
  token: string | null,
  userId: string | null,
  init?: RequestInit
): Promise<T> {
  // Signed out, we send guest headers instead: the API serves read-only routes
  // to guests and scores against the profile they filled in inline.
  const identity = token
    ? {
        Authorization: `Bearer ${token}`,
        ...(userId ? { "x-user-id": userId } : {}),
      }
    : guestHeaders();

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...identity,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();

    // 403 + ACCOUNT_REQUIRED means "sign up for this", distinct from an
    // expired session, so the UI can prompt rather than bounce to sign-in.
    if (res.status === 403 && text.includes("ACCOUNT_REQUIRED")) {
      let message = "Crea un account gratuito per continuare.";
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch {
        // Keep the default copy.
      }
      throw new AccountRequiredError(message);
    }

    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

/**
 * Hook for authenticated GET requests with TanStack Query.
 *
 * @example
 * const { data, isLoading } = useApiQuery<DashboardData>(
 *   ["dashboard"],
 *   "/analytics/kpis"
 * );
 */
export function useApiQuery<T>(
  queryKey: unknown[],
  endpoint: string,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">
) {
  const { idToken, uid } = useAuth();

  return useQuery<T, Error>({
    // Auth state belongs in the key, not in a gate.
    //
    // This used to wait for Clerk to finish loading before fetching anything,
    // which quietly coupled guest browsing to the auth provider: if Clerk was
    // slow, blocked by an extension, or failed its handshake, a signed-out
    // visitor sat in front of a permanently empty app — the exact audience
    // guest mode exists to convince.
    //
    // Guests need no token, so they fetch immediately. Keying on auth state
    // means a signed-in user's queries refetch by themselves the moment their
    // token arrives, without anyone waiting on it first.
    queryKey: [...queryKey, idToken ? "auth" : "guest"],
    queryFn: () =>
      fetchWithAuth<T>(`${API_BASE_URL}${endpoint}`, idToken, uid),
    ...options,
  });
}

/**
 * Hook for authenticated POST/PUT/DELETE mutations with TanStack Query.
 *
 * @example
 * const mutation = useApiMutation<Response, RequestBody>("/tenders/favorite");
 * mutation.mutate({ tenderId: "123" });
 */
export function useApiMutation<TData, TVariables>(
  endpoint: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
  options?: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn">
) {
  const { idToken, uid } = useAuth();

  return useMutation<TData, Error, TVariables>({
    mutationFn: (variables) =>
      fetchWithAuth<TData>(`${API_BASE_URL}${endpoint}`, idToken, uid, {
        method,
        body: JSON.stringify(variables),
      }),
    ...options,
    // Guests can browse and score but not persist. Handling that here means
    // every write gets the right prompt without each call site special-casing
    // it — and without showing "Errore nel salvataggio" for what is really an
    // invitation to sign up.
    onError: (
      ...args: Parameters<
        NonNullable<UseMutationOptions<TData, Error, TVariables>["onError"]>
      >
    ) => {
      const [error] = args;

      if (error instanceof AccountRequiredError) {
        toast.info("Crea un account gratuito", {
          description: error.message,
          action: {
            label: "Registrati",
            onClick: () => {
              window.location.href = "/sign-up";
            },
          },
          duration: 8000,
        });
        return;
      }

      options?.onError?.(...args);
    },
  });
}
