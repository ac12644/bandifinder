"use client";

import { cn } from "@/lib/utils";
import { RefreshCw, CheckCircle2, AlertCircle, Lightbulb } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface ReflectionFeedbackProps {
  reflectionCount: number;
  qualityIssues?: string[];
  improvements?: string;
  className?: string;
  defaultOpen?: boolean;
}

export function ReflectionFeedback({
  reflectionCount,
  qualityIssues = [],
  improvements,
  className,
  defaultOpen = false,
}: ReflectionFeedbackProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (reflectionCount === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          <span className="text-xs">
            Auto-migliorata {reflectionCount}x
          </span>
          <span
            className={cn(
              "transition-transform duration-200",
              isOpen ? "rotate-180" : ""
            )}
          >
            ▼
          </span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-700">
                Processo di Riflessione AI
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                L'AI ha analizzato e migliorato la risposta {reflectionCount} volt
                {reflectionCount === 1 ? "a" : "e"} per garantire maggiore accuratezza.
              </p>
            </div>
          </div>

          {qualityIssues.length > 0 && (
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-orange-700">
                  Problemi Identificati
                </p>
                <ul className="mt-1 space-y-0.5">
                  {qualityIssues.map((issue, index) => (
                    <li
                      key={index}
                      className="text-muted-foreground text-xs flex items-start gap-1"
                    >
                      <span className="text-orange-400">•</span>
                      {issue}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {improvements && (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-emerald-700">
                  Miglioramenti Applicati
                </p>
                <p className="text-muted-foreground text-xs mt-1">
                  {improvements}
                </p>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
