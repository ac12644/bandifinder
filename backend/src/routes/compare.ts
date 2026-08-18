/**
 * Compare Routes
 *
 * Side-by-side tender comparison.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";
import type { TEDNotice, I18nString } from "../lib/types";

export const compareRoutes = new Hono<Env>();

const compareSchema = z.object({
  tenderIds: z.array(z.string()).min(2).max(5),
});

interface TenderWithId extends TEDNotice {
  id: string;
  error?: string;
}

/**
 * Helper: Extract i18n string value
 */
function extractI18n(field: I18nString | undefined): string | null {
  if (!field) return null;
  if (Array.isArray(field.ita)) return field.ita[0] || null;
  if (typeof field.ita === "string") return field.ita;
  if (Array.isArray(field.eng)) return field.eng[0] || null;
  if (typeof field.eng === "string") return field.eng;
  return null;
}

/**
 * POST /compare - Compare multiple tenders
 */
compareRoutes.post("/", zValidator("json", compareSchema), async (c) => {
  const { tenderIds } = c.req.valid("json");

  try {
    // Fetch all tenders
    const tenders: TenderWithId[] = await Promise.all(
      tenderIds.map(async (id) => {
        try {
          const response = await fetch(
            `https://api.ted.europa.eu/v3/notices/${id}`,
            { headers: { Accept: "application/json" } }
          );
          if (response.ok) {
            const data = (await response.json()) as TEDNotice;
            return { id, ...data } as TenderWithId;
          }
          return { id, error: "Not found" } as TenderWithId;
        } catch (e) {
          return { id, error: e instanceof Error ? e.message : "Fetch failed" } as TenderWithId;
        }
      })
    );

    // Build comparison matrix
    const comparison = {
      tenders,
      matrix: {
        value: tenders.map((t) =>
          t["estimated-value-glo"] || t["total-value"] || null
        ),
        deadline: tenders.map((t) => {
          const deadlineLot = t["deadline-receipt-tender-date-lot"];
          const deadlineDate = t["deadline-date-lot"];
          if (Array.isArray(deadlineLot)) return deadlineLot[0];
          if (Array.isArray(deadlineDate)) return deadlineDate[0];
          return deadlineLot || deadlineDate || null;
        }),
        buyer: tenders.map((t) => extractI18n(t["buyer-name"])),
        cpv: tenders.map((t) => {
          const cpv = t["classification-cpv"];
          return Array.isArray(cpv) ? cpv[0] : cpv || null;
        }),
        country: tenders.map((t) => {
          const country = t["organisation-country-buyer"];
          return Array.isArray(country) ? country[0] : country || null;
        }),
      },
      summary: {
        highestValue: Math.max(
          ...tenders.map((t) =>
            (typeof t["estimated-value-glo"] === "number" ? t["estimated-value-glo"] : 0) ||
            (typeof t["total-value"] === "number" ? t["total-value"] : 0)
          )
        ),
        earliestDeadline: tenders
          .map((t) => {
            const deadlineLot = t["deadline-receipt-tender-date-lot"];
            return Array.isArray(deadlineLot) ? deadlineLot[0] : deadlineLot;
          })
          .filter(Boolean)
          .sort()[0] || null,
      },
    };

    return c.json(comparison);
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Comparison failed",
    }, 500);
  }
});
