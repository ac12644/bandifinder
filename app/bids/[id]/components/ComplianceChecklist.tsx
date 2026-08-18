"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ChecklistItem } from "@/lib/hooks/useBids";
import {
  useToggleChecklistItem,
  useAddChecklistItem,
} from "@/lib/hooks/useBids";

interface ComplianceChecklistProps {
  bidId: string;
  checklist: ChecklistItem[];
  progress: { total: number; completed: number };
}

export function ComplianceChecklist({
  bidId,
  checklist,
  progress,
}: ComplianceChecklistProps) {
  const [newLabel, setNewLabel] = useState("");
  const toggle = useToggleChecklistItem(bidId);
  const addItem = useAddChecklistItem(bidId);

  const percentage =
    progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  const handleToggle = (item: ChecklistItem) => {
    toggle.mutate(
      { itemId: item.id, completed: !item.completed },
      { onError: () => toast.error("Errore nell'aggiornamento") }
    );
  };

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    addItem.mutate(
      { label: newLabel.trim(), sort_order: checklist.length },
      {
        onSuccess: () => setNewLabel(""),
        onError: () => toast.error("Errore nell'aggiunta"),
      }
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Checklist Preparazione</CardTitle>
          <span className="text-sm text-muted-foreground">
            {progress.completed}/{progress.total}
          </span>
        </div>
        <Progress value={percentage} className="h-2" />
      </CardHeader>
      <CardContent className="space-y-1">
        {checklist.map((item) => (
          <button
            key={item.id}
            onClick={() => handleToggle(item)}
            className="flex items-center gap-3 w-full text-left py-2 px-2 rounded hover:bg-muted/50 transition-colors"
          >
            {item.completed ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
            )}
            <span
              className={`text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}
            >
              {item.label}
            </span>
          </button>
        ))}

        {/* Add new item */}
        <div className="flex items-center gap-2 pt-2 border-t mt-2">
          <Input
            placeholder="Aggiungi voce..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-sm"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleAdd}
            disabled={!newLabel.trim() || addItem.isPending}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
