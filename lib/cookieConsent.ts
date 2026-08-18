const STORAGE_KEY = "cookie-consent";

export type ConsentValue = "accepted" | "rejected" | null;

export function getConsent(): ConsentValue {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(STORAGE_KEY);
  if (val === "accepted" || val === "rejected") return val;
  return null;
}

export function setConsent(value: "accepted" | "rejected") {
  localStorage.setItem(STORAGE_KEY, value);
}

export function hasAnalyticsConsent(): boolean {
  return getConsent() === "accepted";
}
