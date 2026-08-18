"use client";

import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { Sparkles, History, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestionChipProps {
  suggestion: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "default" | "ai" | "personalized" | "history";
  index?: number;
}

function SuggestionChip({
  suggestion,
  onClick,
  disabled,
  variant = "default",
  index = 0,
}: SuggestionChipProps) {
  const variantStyles = {
    default: "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50",
    ai: "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 hover:border-blue-300 hover:from-blue-100 hover:to-indigo-100",
    personalized: "bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 hover:border-purple-300 hover:from-purple-100 hover:to-pink-100",
    history: "bg-gray-50 border-gray-200 hover:border-gray-300 hover:bg-gray-100",
  };

  const iconStyles = {
    default: null,
    ai: <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />,
    personalized: <User className="h-3 w-3 text-purple-500 shrink-0" />,
    history: <History className="h-3 w-3 text-gray-400 shrink-0" />,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 border rounded-full",
        "transition-all duration-200 cursor-pointer",
        "hover:shadow-sm active:scale-[0.98]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none",
        "animate-in fade-in slide-in-from-bottom-2",
        variantStyles[variant]
      )}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
      aria-label={`Suggerimento: ${suggestion}`}
    >
      {iconStyles[variant]}
      <span className="truncate max-w-[200px]">{suggestion}</span>
    </button>
  );
}

interface SuggestionsPanelProps {
  suggestions: string[];
  aiSuggestions: string[];
  personalizedSuggestions: string[];
  onPick: (suggestion: string) => void;
  loading?: boolean;
  disabled?: boolean;
  showSuggestions: boolean;
}

export function SuggestionsPanel({
  suggestions,
  aiSuggestions,
  personalizedSuggestions,
  onPick,
  loading,
  disabled,
  showSuggestions,
}: SuggestionsPanelProps) {
  if (!showSuggestions) return null;

  const hasAnySuggestions =
    personalizedSuggestions.length > 0 ||
    aiSuggestions.length > 0 ||
    suggestions.length > 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Loading state */}
      {loading && !hasAnySuggestions && (
        <div className="flex justify-center py-8">
          <div className="flex items-center gap-3 px-4 py-3 rounded-full bg-gray-50 border border-gray-100 text-sm text-gray-500">
            <Spinner className="h-4 w-4" />
            <span>Generando suggerimenti personalizzati...</span>
          </div>
        </div>
      )}

      {/* Personalized suggestions */}
      {personalizedSuggestions.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-purple-50/50 to-pink-50/50 p-5 border border-purple-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-purple-100">
              <User className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <h3 className="text-sm font-medium text-purple-900">
              Personalizzati per te
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {personalizedSuggestions.slice(0, 4).map((s, i) => (
              <SuggestionChip
                key={`personalized-${i}`}
                suggestion={s}
                onClick={() => onPick(s)}
                disabled={disabled}
                variant="personalized"
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* AI suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-blue-50/50 to-indigo-50/50 p-5 border border-blue-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-blue-100">
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <h3 className="text-sm font-medium text-blue-900">
              Suggerimenti AI
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {aiSuggestions.slice(0, 4).map((s, i) => (
              <SuggestionChip
                key={`ai-${i}`}
                suggestion={s}
                onClick={() => onPick(s)}
                disabled={disabled}
                variant="ai"
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent searches */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl bg-gray-50/50 p-5 border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-gray-200">
              <History className="h-3.5 w-3.5 text-gray-600" />
            </div>
            <h3 className="text-sm font-medium text-gray-700">
              Ricerche recenti
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {suggestions.slice(0, 4).map((s, i) => (
              <SuggestionChip
                key={`history-${i}`}
                suggestion={s}
                onClick={() => onPick(s)}
                disabled={disabled}
                variant="history"
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasAnySuggestions && (
        <div className="text-center py-8 text-gray-400">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            Inizia a cercare per ricevere suggerimenti personalizzati
          </p>
        </div>
      )}
    </div>
  );
}
