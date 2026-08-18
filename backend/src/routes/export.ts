/**
 * Export Routes
 *
 * Export tenders to CSV/PDF.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { Env } from "../app";

export const exportRoutes = new Hono<Env>();

const exportSchema = z.object({
  tenderIds: z.array(z.string()),
  format: z.enum(["csv", "pdf", "json"]),
  fields: z.array(z.string()).optional(),
});

/**
 * POST /export - Export tenders
 */
exportRoutes.post("/", zValidator("json", exportSchema), async (c) => {
  const { tenderIds, format, fields } = c.req.valid("json");

  try {
    // Fetch tender data
    const tenders = await Promise.all(
      tenderIds.map(async (id) => {
        try {
          const response = await fetch(
            `https://api.ted.europa.eu/v3/notices/${id}`,
            { headers: { Accept: "application/json" } }
          );
          if (response.ok) {
            return response.json();
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const validTenders = tenders.filter(Boolean);

    switch (format) {
      case "csv": {
        const headers = fields || [
          "publicationNumber",
          "title",
          "buyer",
          "publicationDate",
          "deadline",
          "value",
        ];

        const csvRows = [headers.join(",")];

        for (const tender of validTenders) {
          const row = headers.map((h) => {
            const value = tender[h] || "";
            // Escape CSV values
            return `"${String(value).replace(/"/g, '""')}"`;
          });
          csvRows.push(row.join(","));
        }

        return new Response(csvRows.join("\n"), {
          headers: {
            "Content-Type": "text/csv",
            "Content-Disposition": `attachment; filename="tenders-${Date.now()}.csv"`,
          },
        });
      }

      case "json":
        return c.json({
          tenders: validTenders,
          count: validTenders.length,
          exportedAt: new Date().toISOString(),
        });

      case "pdf":
        // PDF generation would require a library like PDFKit
        return c.json({
          error: "PDF export not yet implemented",
          suggestion: "Use JSON or CSV format",
        }, 501);

      default:
        return c.json({ error: "Invalid format" }, 400);
    }
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : "Export failed",
    }, 500);
  }
});
