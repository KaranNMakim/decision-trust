"use client";

import { useState } from "react";
import { API } from "@/lib/api";
import { Button, Card, CardTitle } from "@/components/ui";

const TYPES = [
  { key: "glossary", label: "Business glossary", cols: "term_id, term, definition, steward_email, required_components, synonyms" },
  { key: "metric", label: "Metrics (dashboard KPIs)", cols: "metric_id, name, formula, grain, owner_email, team, glossary_term, data_product, certification, refresh_sla_h, last_refreshed" },
  { key: "dashboard", label: "Dashboards", cols: "dashboard_id, name, tool, audience, owner_email, monthly_viewers, metrics, local_overrides" },
  { key: "lineage", label: "Data product lineage", cols: "from_type, from_id, from_name, relation, to_type, to_id, to_name, documented" },
  { key: "recommendation", label: "AI recommendations", cols: "rec_id, model, version, title, raw_confidence, input_features, evidence, rationale, accepted_90d, success_90d, rule_violations" },
];

export default function IngestPage() {
  const [result, setResult] = useState<Record<string, string>>({});

  async function upload(type: string, file: File | undefined, mode: "upsert" | "replace") {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/ingest/${type}?mode=${mode}`, { method: "POST", body: fd, headers: { "X-User": "steward@acme.com" } });
    const body = await res.json();
    setResult((r) => ({
      ...r,
      [type]: res.ok ? `${body.rows_ingested} rows ingested, ${body.errors.length} errors · ${body.conflicts_open} open conflicts` : body.detail ?? "Upload failed",
    }));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Ingest metadata</h1>
      <p className="text-sm text-muted-foreground">Metadata only: no row-level data ever leaves your systems. Scores recompute after every upload.</p>
      {TYPES.map((t) => (
        <Card key={t.key} className="space-y-2">
          <CardTitle className="text-foreground">{t.label}</CardTitle>
          <p className="font-mono text-xs text-muted-foreground">{t.cols}</p>
          <div className="flex items-center gap-3">
            <input type="file" accept=".csv" id={`f-${t.key}`} className="text-sm" />
            <Button variant="outline" onClick={() => upload(t.key, (document.getElementById(`f-${t.key}`) as HTMLInputElement).files?.[0], "upsert")}>Upsert</Button>
            <Button variant="ghost" onClick={() => upload(t.key, (document.getElementById(`f-${t.key}`) as HTMLInputElement).files?.[0], "replace")}>Replace all</Button>
          </div>
          {result[t.key] && <p className="text-xs">{result[t.key]}</p>}
        </Card>
      ))}
    </div>
  );
}
