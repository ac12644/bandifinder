"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ArrowUp, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  loading: boolean;
  placeholder?: string;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  loading,
  placeholder = "Cerca bandi pubblici per la tua azienda…",
}: ChatInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = React.useState(false);

  // Auto-resize textarea
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
    }
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="flex-shrink-0 border-t border-gray-100 bg-white/80 backdrop-blur-sm px-4 py-4">
      <div
        className={cn(
          "relative flex items-end gap-3 rounded-2xl border bg-white p-2 shadow-sm transition-all duration-200",
          isFocused
            ? "border-blue-300 ring-4 ring-blue-100"
            : "border-gray-200 hover:border-gray-300"
        )}
      >
        {/* Sparkles icon for AI indicator */}
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
          <Sparkles className="h-4 w-4" />
        </div>

        <Textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "flex-1 resize-none border-0 bg-transparent pl-10 pr-2 py-3 text-base",
            "placeholder:text-gray-400",
            "focus:ring-0 focus:outline-none focus-visible:ring-0",
            "min-h-[48px] max-h-[150px]"
          )}
          rows={1}
          aria-label="Messaggio per Bandifinder.it"
          disabled={loading}
        />

        <Button
          onClick={onSubmit}
          disabled={loading || !value.trim()}
          size="icon"
          className={cn(
            "h-10 w-10 rounded-xl shrink-0 transition-all duration-200",
            value.trim() && !loading
              ? "bg-blue-500 hover:bg-blue-600 hover:scale-105 shadow-md"
              : "bg-gray-200 text-gray-400 cursor-not-allowed"
          )}
          aria-label={loading ? "Invio in corso..." : "Invia messaggio"}
        >
          {loading ? (
            <Spinner className="h-4 w-4 text-white" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-400 text-center mt-2">
        Premi <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Enter</kbd> per inviare, <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Shift+Enter</kbd> per nuova riga
      </p>
    </div>
  );
}
