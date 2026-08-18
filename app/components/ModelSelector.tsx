"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Zap, Brain, Bot } from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";

export type LLMProvider = "gemini" | "openrouter" | "openai" | "anthropic";

interface ModelInfo {
  id: string;
  name: string;
}

interface ModelsResponse {
  providers: LLMProvider[];
  models: Record<LLMProvider, ModelInfo[]>;
  current: {
    provider: LLMProvider;
    model: string;
  };
}

const PROVIDER_ICONS: Record<LLMProvider, React.ReactNode> = {
  gemini: <Sparkles className="h-4 w-4 text-blue-500" />,
  openrouter: <Zap className="h-4 w-4 text-purple-500" />,
  openai: <Brain className="h-4 w-4 text-green-500" />,
  anthropic: <Bot className="h-4 w-4 text-orange-500" />,
};

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
};

interface ModelSelectorProps {
  provider: LLMProvider;
  model: string;
  onProviderChange: (provider: LLMProvider) => void;
  onModelChange: (model: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function ModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false,
  compact = false,
}: ModelSelectorProps) {
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch available models on mount
  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch(`${API_BASE_URL}/models`);
        if (response.ok) {
          const data = await response.json();
          setModelsData(data);
        }
      } catch (error) {
        console.warn("Failed to fetch models:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, []);

  const availableModels = modelsData?.models[provider] || [];

  // Update model when provider changes
  useEffect(() => {
    if (modelsData && provider) {
      const providerModels = modelsData.models[provider];
      if (providerModels && providerModels.length > 0) {
        // Check if current model is valid for new provider
        const isValidModel = providerModels.some((m) => m.id === model);
        if (!isValidModel) {
          onModelChange(providerModels[0].id);
        }
      }
    }
  }, [provider, modelsData, model, onModelChange]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading models...
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <Select
          value={provider}
          onValueChange={(v) => onProviderChange(v as LLMProvider)}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <div className="flex items-center gap-1.5">
              {PROVIDER_ICONS[provider]}
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {modelsData?.providers.map((p) => (
              <SelectItem key={p} value={p} className="text-xs">
                <div className="flex items-center gap-2">
                  {PROVIDER_ICONS[p]}
                  {PROVIDER_LABELS[p]}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={model}
          onValueChange={onModelChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableModels.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-muted/50 rounded-lg border">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">AI Model</span>
        <Badge variant="outline" className="text-xs">
          {PROVIDER_LABELS[provider]}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Provider</label>
          <Select
            value={provider}
            onValueChange={(v) => onProviderChange(v as LLMProvider)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <div className="flex items-center gap-2">
                {PROVIDER_ICONS[provider]}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {modelsData?.providers.map((p) => (
                <SelectItem key={p} value={p}>
                  <div className="flex items-center gap-2">
                    {PROVIDER_ICONS[p]}
                    {PROVIDER_LABELS[p]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Model</label>
          <Select
            value={model}
            onValueChange={onModelChange}
            disabled={disabled}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// Simple inline selector for the chat input area
export function InlineModelSelector({
  provider,
  model,
  onProviderChange,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);

  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch(`${API_BASE_URL}/models`);
        if (response.ok) {
          const data = await response.json();
          setModelsData(data);
        }
      } catch (error) {
        console.warn("Failed to fetch models:", error);
      }
    }
    fetchModels();
  }, []);

  const currentModelName =
    modelsData?.models[provider]?.find((m) => m.id === model)?.name || model;

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Select
        value={provider}
        onValueChange={(v) => {
          const newProvider = v as LLMProvider;
          onProviderChange(newProvider);
          // Set default model for new provider
          const defaultModel = modelsData?.models[newProvider]?.[0]?.id;
          if (defaultModel) onModelChange(defaultModel);
        }}
        disabled={disabled}
      >
        <SelectTrigger className="h-6 w-auto min-w-[100px] border-none bg-transparent px-1 text-xs hover:bg-muted">
          <div className="flex items-center gap-1">
            {PROVIDER_ICONS[provider]}
            <span className="max-w-[80px] truncate">{PROVIDER_LABELS[provider]}</span>
          </div>
        </SelectTrigger>
        <SelectContent>
          {modelsData?.providers.map((p) => (
            <SelectItem key={p} value={p} className="text-xs">
              <div className="flex items-center gap-2">
                {PROVIDER_ICONS[p]}
                {PROVIDER_LABELS[p]}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="text-muted-foreground/50">•</span>

      <Select
        value={model}
        onValueChange={onModelChange}
        disabled={disabled}
      >
        <SelectTrigger className="h-6 w-auto min-w-[120px] border-none bg-transparent px-1 text-xs hover:bg-muted">
          <span className="max-w-[150px] truncate">{currentModelName}</span>
        </SelectTrigger>
        <SelectContent>
          {modelsData?.models[provider]?.map((m) => (
            <SelectItem key={m.id} value={m.id} className="text-xs">
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
