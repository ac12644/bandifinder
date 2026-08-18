/**
 * Vercel Cron: Ingest Tenders
 *
 * Triggered every 6 hours by Vercel cron.
 * Calls the backend API to run ingestion.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 300; // 5 minutes

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://api-gold-phi.vercel.app";
const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Run all connectors (TED + ANAC)
    const response = await fetch(`${API_BASE_URL}/ingestion/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Scheduled jobs have no Clerk session; they authenticate to the API
        // with the shared service secret.
        ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
      },
      body: JSON.stringify({
        source: "all",
        limit: 500,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("[Cron] Ingestion failed:", result);
      return NextResponse.json(
        { error: "Ingestion failed", details: result },
        { status: 500 }
      );
    }

    console.log("[Cron] Tender ingestion complete:", result);

    // Also run award ingestion (non-fatal if it fails)
    let awardResult = null;
    try {
      const awardResponse = await fetch(`${API_BASE_URL}/ingestion/awards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(CRON_SECRET ? { Authorization: `Bearer ${CRON_SECRET}` } : {}),
        },
        body: JSON.stringify({ limit: 200 }),
      });
      awardResult = await awardResponse.json();
      if (!awardResponse.ok) {
        console.error("[Cron] Award ingestion failed:", awardResult);
      } else {
        console.log("[Cron] Award ingestion complete:", awardResult);
      }
    } catch (awardErr) {
      console.error("[Cron] Award ingestion error:", awardErr);
    }

    return NextResponse.json({ success: true, result, awardResult });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[Cron] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
