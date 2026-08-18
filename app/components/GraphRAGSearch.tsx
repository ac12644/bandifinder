"use client";

import * as React from "react";
import { useState } from "react";
import { useGraphRAGSearch, type GraphRAGResult } from "../hooks/useGraphRAGSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  Network,
  ChevronDown,
  ChevronUp,
  Clock,
  Target,
  GitBranch,
  Zap,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface GraphRAGSearchProps {
  onResultSelect?: (result: GraphRAGResult) => void;
  className?: string;
}

export function GraphRAGSearch({ onResultSelect, className }: GraphRAGSearchProps) {
  const { results, isLoading, error, stats, timing, search, reset } = useGraphRAGSearch();

  const [query, setQuery] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [graphDepth, setGraphDepth] = useState(2);
  const [vectorTopK, setVectorTopK] = useState(20);
  const [finalTopK, setFinalTopK] = useState(10);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    await search(query, undefined, {
      graphDepth,
      vectorTopK,
      finalTopK,
      includeExplanation: true,
    });
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search Form */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">GraphRAG Search</CardTitle>
          </div>
          <CardDescription>
            Ricerca avanzata con knowledge graph e semantic search combinati
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Es: servizi IT per pubblica amministrazione in Italia"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={isLoading || !query.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2 hidden sm:inline">Cerca</span>
              </Button>
            </div>

            {/* Advanced Options */}
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Opzioni avanzate
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Profondità grafo: {graphDepth}</Label>
                    <Slider
                      value={[graphDepth]}
                      onValueChange={([v]) => setGraphDepth(v)}
                      min={1}
                      max={4}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">
                      Quanti hop nel knowledge graph
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Vector Top-K: {vectorTopK}</Label>
                    <Slider
                      value={[vectorTopK]}
                      onValueChange={([v]) => setVectorTopK(v)}
                      min={5}
                      max={50}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Risultati iniziali da Pinecone
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Risultati finali: {finalTopK}</Label>
                    <Slider
                      value={[finalTopK]}
                      onValueChange={([v]) => setFinalTopK(v)}
                      min={5}
                      max={30}
                      step={5}
                    />
                    <p className="text-xs text-muted-foreground">
                      Numero massimo di risultati
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </form>
        </CardContent>
      </Card>

      {/* Stats Banner */}
      {stats && timing && (
        <div className="flex flex-wrap gap-3 text-xs">
          <Badge variant="secondary" className="gap-1">
            <GitBranch className="h-3 w-3" />
            {stats.nodesTraversed} nodi
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Network className="h-3 w-3" />
            {stats.edgesTraversed} archi
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Target className="h-3 w-3" />
            {stats.expansionPaths} espansioni
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Clock className="h-3 w-3" />
            {timing.totalMs}ms totale
          </Badge>
          <Badge variant="outline" className="gap-1 text-muted-foreground">
            <Zap className="h-3 w-3" />
            Vector: {timing.vectorSearchMs}ms | Graph: {timing.graphTraversalMs}ms
          </Badge>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm text-muted-foreground">
            {results.length} risultati trovati
          </h3>
          {results.map((result, i) => (
            <GraphRAGResultCard
              key={`${result.tenderId}-${i}`}
              result={result}
              onSelect={onResultSelect}
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && results.length === 0 && query && !error && (
        <div className="text-center py-8 text-muted-foreground">
          <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>Nessun risultato trovato</p>
          <p className="text-xs mt-1">Prova a modificare i termini di ricerca</p>
        </div>
      )}
    </div>
  );
}

interface GraphRAGResultCardProps {
  result: GraphRAGResult;
  onSelect?: (result: GraphRAGResult) => void;
}

function GraphRAGResultCard({ result, onSelect }: GraphRAGResultCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  const scoreColor =
    result.score >= 0.8
      ? "text-emerald-600 bg-emerald-50"
      : result.score >= 0.6
      ? "text-blue-600 bg-blue-50"
      : "text-amber-600 bg-amber-50";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-medium text-sm truncate">{result.title}</h4>
              {Boolean(result.metadata.discoveredViaGraph) && (
                <Badge variant="outline" className="text-xs shrink-0">
                  <GitBranch className="h-3 w-3 mr-1" />
                  Via grafo
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {result.description}
            </p>

            {/* Metadata */}
            <div className="flex flex-wrap gap-2 mt-2">
              {typeof result.metadata.buyerName === "string" && result.metadata.buyerName && (
                <Badge variant="secondary" className="text-xs">
                  {result.metadata.buyerName}
                </Badge>
              )}
              {typeof result.metadata.country === "string" && result.metadata.country && (
                <Badge variant="secondary" className="text-xs">
                  {result.metadata.country}
                </Badge>
              )}
              {typeof result.metadata.value === "number" && result.metadata.value > 0 && (
                <Badge variant="secondary" className="text-xs">
                  €{result.metadata.value.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>

          {/* Scores */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            <div className={cn("px-2 py-1 rounded-md text-xs font-medium", scoreColor)}>
              {(result.score * 100).toFixed(0)}%
            </div>
            <div className="text-[10px] text-muted-foreground text-right">
              <div>Vector: {(result.vectorScore * 100).toFixed(0)}%</div>
              <div>Graph: {(result.graphScore * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>

        {/* Explanation Toggle */}
        {result.explanation && (
          <Collapsible open={showExplanation} onOpenChange={setShowExplanation}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 gap-1 h-7 text-xs">
                {showExplanation ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Perché questo risultato?
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 pt-2 border-t">
              <div className="space-y-2 text-xs">
                <p className="text-muted-foreground">{result.explanation.vectorMatch}</p>

                {result.explanation.graphPaths.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Percorsi nel grafo:</p>
                    <div className="space-y-1">
                      {result.explanation.graphPaths.slice(0, 3).map((path, i) => (
                        <div key={i} className="flex items-center gap-1 text-muted-foreground">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          <span className="truncate">{path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.explanation.relatedEntities.length > 0 && (
                  <div>
                    <p className="font-medium mb-1">Entità correlate:</p>
                    <div className="flex flex-wrap gap-1">
                      {result.explanation.relatedEntities.map((entity, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">
                          {entity.type}: {entity.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => onSelect?.(result)}
          >
            Dettagli
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a
              href={`https://ted.europa.eu/udl?uri=TED:NOTICE:${result.tenderId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
