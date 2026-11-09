import { useMemo } from "react";
import { API_URL } from "./config";
import { useGetToken } from "./auth";

export interface Alarm { name: string; service: string; metric: string; state: string; fired_at: string; region: string }
export interface Scenario { id: string; alarm: Alarm }
export interface Step { ts: string; agent: string; kind: string; text: string }
export interface Change { id: string; ts: string; author: string; file: string; summary: string; diff: string }
export interface Result {
  scenario_id: string;
  engine: string;
  triage: { severity: string; service: string; summary: string; suspected_categories: string[] };
  investigation: { root_cause_category: string; culprit_change_id: string | null; confidence: number; evidence: string[]; summary: string };
  culprit: Change | null;
  fix: { pr_title: string; pr_body: string; patch: string; blocked: boolean; block_reasons: string[] };
  injection: { detected: boolean; lines: string[] };
  metrics: { latency_s: number; tokens: number; cost_usd: number };
}
export type Status = "pending" | "running" | "awaiting_approval" | "approved" | "rejected" | "failed";
export interface Job {
  id: string; scenario_id: string; status: Status; created_at: string; updated_at: string;
  steps: Step[]; result: Result | null; error: string | null; alarm: Alarm;
  approval: { decision: string; by: string; at: string; pr_url?: string; pr_simulated?: boolean } | null;
}
export interface JobRow { id: string; scenario_id: string; status: Status; created_at: string; alarm: Alarm; root_cause: string | null }
export interface Health { ok: boolean; engine: string; auth: string }
export interface EvalRow {
  scenario_id: string; service: string; truth_category: string; pred_category: string; category_ok: boolean;
  culprit_ok: boolean; injected: boolean; injection_detected: boolean; latency_s: number; cost_usd: number; error: string | null;
}
export interface EvalReport {
  ran_at: string;
  summary: {
    engine: string; total: number; category_accuracy: number; culprit_accuracy: number; injection_cases: number;
    injection_detected: number; injection_misled: number; latency_p50_s: number; latency_p95_s: number;
    cost_per_incident_usd: number; errors: number; note: string;
  };
  rows: EvalRow[];
}

export function useApi() {
  const getToken = useGetToken();
  return useMemo(() => {
    async function call<T>(path: string, init: RequestInit = {}, extra: Record<string, string> = {}): Promise<T> {
      const token = await getToken();
      const res = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...extra,
        },
      });
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = (await res.json()).detail ?? detail; } catch {}
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      return res.json();
    }
    return {
      get: <T,>(p: string) => call<T>(p),
      post: <T,>(p: string, body: unknown, extra: Record<string, string> = {}) =>
        call<T>(p, { method: "POST", body: JSON.stringify(body) }, extra),
    };
  }, [getToken]);
}
