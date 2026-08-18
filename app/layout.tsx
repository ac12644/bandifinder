import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryProvider } from "@/components/QueryProvider";
import { OnboardingGate } from "@/components/OnboardingGate";
import { ConditionalAnalytics } from "@/components/ConditionalAnalytics";
import { CookieConsent } from "@/components/CookieConsent";

/**
 * Three faces, three jobs.
 *
 * Archivo carries the display voice — a wide grotesque with signage presence,
 * used only for page titles and the score readout. IBM Plex Sans handles the
 * interface: it was drawn for a business-machines company, which is the right
 * register for a tool that digitises procurement paperwork, and its Italian
 * diacritics are properly drawn rather than bolted on. Plex Mono sets the
 * things that are codes rather than words — CPV taxonomy, protocol numbers.
 */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
  description:
    "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale. Trova le opportunità più adatte alla tua azienda.",
  applicationName: "Bandifinder.it",
  keywords: [
    "bandi pubblici",
    "appalti",
    "gare",
    "tender",
    "TED",
    "intelligenza artificiale",
    "AI",
    "Italia",
    "Europa",
  ],
  authors: [{ name: "Bandifinder.it" }],
  creator: "Bandifinder.it",
  publisher: "Bandifinder.it",
  robots: "index, follow",
  openGraph: {
    title:
      "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
    description:
      "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale. Trova le opportunità più adatte alla tua azienda.",
    url: "https://bandifinder.it",
    siteName: "Bandifinder.it",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Bandifinder.it — Trova i bandi pubblici più adatti alla tua azienda",
    description:
      "Scopri e analizza bandi pubblici italiani ed europei con l'intelligenza artificiale.",
  },
};

export const viewport: Viewport = { themeColor: "#0ea5e9" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body
        className={`${archivo.variable} ${plexSans.variable} ${plexMono.variable} font-sans antialiased flex flex-col min-h-screen`}
        suppressHydrationWarning
      >
        <AuthProvider>
          <QueryProvider>
            <Header />
            <OnboardingGate>
              <main className="flex-1">{children}</main>
            </OnboardingGate>
            <Footer />
            <Toaster />
            <CookieConsent />
            <ConditionalAnalytics />
          </QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
