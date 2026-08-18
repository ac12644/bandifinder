"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, ExternalLink, CalendarPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AddToCalendarButtonProps {
  tenderId: string;
  title: string;
  buyer?: string;
  deadline: string; // ISO date string
  description?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function AddToCalendarButton({
  tenderId,
  title,
  buyer,
  deadline,
  description,
  variant = "outline",
  size = "sm",
  className,
}: AddToCalendarButtonProps) {
  const [loading, setLoading] = React.useState(false);

  // Generate Google Calendar URL client-side
  const getGoogleCalendarUrl = (): string => {
    const deadlineDate = new Date(deadline);
    const dateStr = deadlineDate.toISOString().split("T")[0].replace(/-/g, "");
    const nextDay = new Date(deadlineDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDateStr = nextDay.toISOString().split("T")[0].replace(/-/g, "");

    const eventDescription = [
      description || "",
      buyer ? `Ente: ${buyer}` : "",
      `ID Bando: ${tenderId}`,
    ]
      .filter(Boolean)
      .join("\n");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: `📋 ${title}`,
      dates: `${dateStr}/${nextDateStr}`,
      details: eventDescription,
      sprop: `website:https://ted.europa.eu/it/notice/-/detail/${tenderId}`,
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  // Generate Outlook Calendar URL
  const getOutlookCalendarUrl = (): string => {
    const deadlineDate = new Date(deadline);
    const startDate = deadlineDate.toISOString();
    const endDate = new Date(
      deadlineDate.getTime() + 24 * 60 * 60 * 1000
    ).toISOString();

    const eventDescription = [
      description || "",
      buyer ? `Ente: ${buyer}` : "",
      `ID Bando: ${tenderId}`,
    ]
      .filter(Boolean)
      .join("\n");

    const params = new URLSearchParams({
      path: "/calendar/action/compose",
      rru: "addevent",
      subject: `📋 ${title}`,
      body: eventDescription,
      startdt: startDate,
      enddt: endDate,
      allday: "true",
    });

    return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
  };

  // Download ICS file
  const downloadIcs = async () => {
    setLoading(true);
    try {
      // Generate ICS content client-side
      const icsContent = generateIcsContent({
        tenderId,
        title,
        buyer,
        deadline,
        description,
      });

      // Create blob and download
      const blob = new Blob([icsContent], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tender-${tenderId}.ics`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading ICS:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size={size}
          className={cn("gap-1.5", className)}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CalendarPlus className="h-3 w-3" />
          )}
          <span className="hidden sm:inline">Aggiungi</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-gray-500 font-normal">
          Aggiungi al calendario
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <a
            href={getGoogleCalendarUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
          >
            <div className="p-1.5 rounded bg-red-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 6L6 18L18 18L18 6Z" fill="#4285F4" />
                <path d="M13 6L6 6L6 13L13 13L13 6Z" fill="#34A853" />
                <path d="M18 13L13 13L13 18L18 18L18 13Z" fill="#FBBC05" />
                <path d="M13 13L6 13L6 18L13 18L13 13Z" fill="#EA4335" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Google Calendar</div>
              <div className="text-xs text-gray-500">Apri in nuova scheda</div>
            </div>
            <ExternalLink className="h-3 w-3 text-gray-400" />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="cursor-pointer">
          <a
            href={getOutlookCalendarUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3"
          >
            <div className="p-1.5 rounded bg-blue-50">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="#0078D4">
                <path d="M7 3H17C18.1 3 19 3.9 19 5V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V5C5 3.9 5.9 3 7 3ZM12 17C14.21 17 16 15.21 16 13C16 10.79 14.21 9 12 9C9.79 9 8 10.79 8 13C8 15.21 9.79 17 12 17Z" />
              </svg>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Outlook Calendar</div>
              <div className="text-xs text-gray-500">Apri in nuova scheda</div>
            </div>
            <ExternalLink className="h-3 w-3 text-gray-400" />
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={downloadIcs} className="cursor-pointer">
          <div className="p-1.5 rounded bg-gray-100 mr-3">
            <Download className="h-4 w-4 text-gray-600" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium">Scarica ICS</div>
            <div className="text-xs text-gray-500">Apple Calendar, altri</div>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Generate ICS file content client-side
 */
function generateIcsContent(event: {
  tenderId: string;
  title: string;
  buyer?: string;
  deadline: string;
  description?: string;
}): string {
  const now = new Date();
  const deadlineDate = new Date(event.deadline);

  const formatDateOnly = (d: Date): string => {
    return d.toISOString().split("T")[0].replace(/-/g, "");
  };

  const formatDateTime = (d: Date): string => {
    return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  };

  const uid = `tender-${event.tenderId}-${now.getTime()}@bandifinder.it`;
  const title = event.title || `Scadenza Bando ${event.tenderId}`;
  const description = [
    event.description || "",
    event.buyer ? `Ente: ${event.buyer}` : "",
    `ID Bando: ${event.tenderId}`,
    `TED: https://ted.europa.eu/it/notice/-/detail/${event.tenderId}`,
  ]
    .filter(Boolean)
    .join("\\n");

  const escapeText = (text: string): string => {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bandifinder.it//Tender Calendar//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatDateTime(now)}`,
    `DTSTART;VALUE=DATE:${formatDateOnly(deadlineDate)}`,
    `DTEND;VALUE=DATE:${formatDateOnly(new Date(deadlineDate.getTime() + 86400000))}`,
    `SUMMARY:📋 ${escapeText(title)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `URL:https://ted.europa.eu/it/notice/-/detail/${event.tenderId}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:Scadenza bando domani: ${escapeText(title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}
