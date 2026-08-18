"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TenderSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  isLoading?: boolean;
}

export function TenderSearchBar({
  value,
  onChange,
  isLoading,
}: TenderSearchBarProps) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce: update parent after 400ms of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 400);
    return () => clearTimeout(timer);
  }, [local, value, onChange]);

  // Sync from parent
  useEffect(() => {
    setLocal(value);
  }, [value]);

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-card transition-shadow",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1"
      )}
    >
      <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
        {isLoading ? (
          <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
        ) : (
          <Search className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <Input
        ref={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Cerca bandi per parola chiave, settore, ente..."
        className="border-0 bg-transparent pl-10 pr-10 h-12 text-sm shadow-none focus-visible:ring-0"
      />
      {local && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 p-0 rounded-full hover:bg-muted"
          onClick={() => {
            setLocal("");
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
