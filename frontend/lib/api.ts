"use client";

import { useCallback, useEffect, useState } from "react";
import type { Zone } from "./utils";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", "X-User": "steward@acme.com", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? body.title ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

// ---------- types (mirror backend/app/main.py responses)

export interface Component {
  key: string;
  label: string;
  weight: number;
  raw: number;
  weighted: number;
  evidence: string[];
  fix: string | null;
}

export interface Score {
  entity_type: string;
  entity_id: string;
  name: string;
  score: number;
  zone: Zone;
  scoring_version: string;
  components: Component[];
  penalties: { conflict_id?: string; code: string; severity?: string; points: number; note?: string }[];
  cap: { metric?: string; ceiling: number; reason?: string } | null;
  explanation: string;
}

export interface MetricRow {
  id: string;
  name: string;
  formula: string;
  owner_email: string | null;
  team: string | null;
  glossary_term: string | null;
  data_product: string | null;
  certification: "none" | "pending" | "certified" | "deprecated";
  last_refreshed: string | null;
  refresh_sla_hours: number;
  trust_score: number;
  zone: Zone;
  explanation: string;
  used_in?: number;
}

export interface Conflict {
  id: string;
  code: "C1" | "C2" | "C3" | "C4" | "C5";
  severity: "critical" | "warning";
  title: string;
  entity_ids: string[];
  blast_radius: number;
  status: "open" | "resolved" | "dismissed";
  detail: Record<string, unknown>;
}

export interface TrustIndex {
  index: number;
  zone: Zone;
  metrics: number;
  certified: number;
  zones: Record<Zone, number>;
  conflicts_open: number;
  conflicts_critical: number;
  top_conflicts: Conflict[];
  recommendations: Record<Zone, number>;
}

export interface GraphNode {
  id: string;
  label: string;
  name: string;
  trust_score: number | null;
  zone: Zone | null;
  certified?: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  documented?: boolean;
}
