/**
 * Guest Session
 *
 * Lets a visitor use the product before creating an account: they can search
 * tenders and see real fit scores against a company profile they fill in
 * inline, with nothing stored server-side.
 *
 * The guest id is purely a client-side handle. It is NOT a credential — the
 * API grants it no identity and no access to any organization's data. It
 * exists so abuse controls have something to key on and so the visitor's own
 * inputs survive a page navigation.
 *
 * Everything here lives in localStorage and is discarded on sign-up, at which
 * point the profile is written to the real account instead.
 */

const GUEST_ID_KEY = "bandifinder_guest_id";
const GUEST_PROFILE_KEY = "bandifinder_guest_profile";

/** The fields the scoring engine actually uses. Mirrors the API's schema. */
export interface GuestProfile {
  companyName?: string;
  cpvCodes?: string[];
  operatingRegions?: string[];
  certifications?: string[];
  annualRevenue?: number | null;
  employeeCount?: number | null;
  yearsInBusiness?: number | null;
  contractSizeMin?: number | null;
  contractSizeMax?: number | null;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/**
 * Stable id for this browser, created on first use.
 *
 * Charset is restricted to what the API accepts, since it ends up in
 * rate-limit keys.
 */
export function getGuestId(): string | null {
  if (!isBrowser()) return null;

  try {
    const existing = localStorage.getItem(GUEST_ID_KEY);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(36).slice(2) + Date.now().toString(36);

    localStorage.setItem(GUEST_ID_KEY, id);
    return id;
  } catch {
    // Private browsing or storage disabled: still usable, just not sticky.
    return null;
  }
}

export function getGuestProfile(): GuestProfile | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY);
    return raw ? (JSON.parse(raw) as GuestProfile) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// React integration
// ---------------------------------------------------------------------------
//
// Exposed as an external store so components can read the profile with
// useSyncExternalStore rather than a mount effect. That keeps server and
// client render consistent without setState-in-effect, and gives subscribers
// a stable reference between changes.

let cachedRaw: string | null = null;
let cachedProfile: GuestProfile | null = null;

/**
 * Snapshot of the stored profile.
 *
 * Returns the same object identity until the underlying value actually
 * changes — re-parsing on every call would hand React a new reference each
 * render and loop.
 */
export function getGuestProfileSnapshot(): GuestProfile | null {
  if (!isBrowser()) return null;

  try {
    const raw = localStorage.getItem(GUEST_PROFILE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedProfile = raw ? (JSON.parse(raw) as GuestProfile) : null;
    }
    return cachedProfile;
  } catch {
    return null;
  }
}

/** Server render has no localStorage; guests are resolved after hydration. */
export function getGuestProfileServerSnapshot(): GuestProfile | null {
  return null;
}

export function subscribeToGuestProfile(onChange: () => void): () => void {
  if (!isBrowser()) return () => {};

  window.addEventListener("guest-profile-changed", onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener("guest-profile-changed", onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function saveGuestProfile(profile: GuestProfile): void {
  if (!isBrowser()) return;

  try {
    localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(profile));
    window.dispatchEvent(new Event("guest-profile-changed"));
  } catch {
    // Non-fatal: scoring degrades to "no profile" and explains what is missing.
  }
}

export function clearGuestSession(): void {
  if (!isBrowser()) return;

  try {
    localStorage.removeItem(GUEST_ID_KEY);
    localStorage.removeItem(GUEST_PROFILE_KEY);
    window.dispatchEvent(new Event("guest-profile-changed"));
  } catch {
    // Nothing to do.
  }
}

/**
 * How complete the guest profile is, as a percentage.
 *
 * Mirrors the API's `guestCompleteness` so the UI can nudge toward the fields
 * that most improve scoring.
 */
export function guestProfileCompleteness(profile: GuestProfile | null): number {
  if (!profile) return 0;

  const checks = [
    (profile.cpvCodes?.length ?? 0) > 0,
    (profile.operatingRegions?.length ?? 0) > 0,
    (profile.certifications?.length ?? 0) > 0,
    profile.annualRevenue != null,
    profile.employeeCount != null,
    profile.yearsInBusiness != null,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Enough of a profile for scores to be meaningful rather than mostly zeros. */
export function hasUsableGuestProfile(profile: GuestProfile | null): boolean {
  return (profile?.cpvCodes?.length ?? 0) > 0;
}

/**
 * Headers identifying this guest to the API.
 *
 * The profile travels base64url-encoded in a header rather than a body so the
 * same value can accompany GET requests.
 */
export function guestHeaders(): Record<string, string> {
  if (!isBrowser()) return {};

  const headers: Record<string, string> = {};

  const id = getGuestId();
  if (id) headers["x-guest-id"] = id;

  const profile = getGuestProfile();
  if (profile) {
    try {
      const json = JSON.stringify(profile);
      const bytes = new TextEncoder().encode(json);
      const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
      const encoded = btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      // The API caps this; skip rather than send something it will discard.
      if (encoded.length <= 4096) headers["x-guest-profile"] = encoded;
    } catch {
      // Skip the profile header; scoring degrades gracefully.
    }
  }

  return headers;
}
