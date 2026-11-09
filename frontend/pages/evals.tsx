import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApi, EvalReport } from "@/lib/api";

export default function Evals() {
  const api = useApi();
  const [rep, setRep] = useState<EvalReport | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api.get<EvalReport>("/api/evals/latest").then(setRep).catch(() => setMissing(true));
  }, [api]);

  const byCat = useMemo(() => {
    if (!rep) return [];
    const m: Record<string, { ok: number; n: number }> = {};
    rep.rows.forEach((r) => {
      m[r.truth_category] ??= { ok: 0, n: 0 };
      m[r.truth_category].n += 1;
      if (r.category_ok) m[r.truth_category].ok += 1;
    });
    return Object.entries(m).map(([k, v]) => ({ name: k.replace(/_/g, " "), accuracy: Math.round((v.ok / v.n) * 100) }));
  }, [rep]);

  if (missing)
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
        <p className="font-semibold">No eval run yet</p>
        <p className="mt-1 text-sm text-muted">Run this in the backend folder, then refresh:</p>
        <code className="mt-3 inline-block rounded bg-slate-900 px-3 py-1.5 text-sm text-slate-100">uv run python -m sre.evals</code>
      </div>
    );
  if (!rep) return <p className="py-20 text-center text-sm text-muted">Loading...</p>;

  const s = rep.summary;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const offline = s.engine.startsWith("offline");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Evaluation: {s.total} simulated incidents</h1>
        <p className="text-sm text-muted">Engine: {s.engine} · ran {new Date(rep.ran_at).toLocaleString()}</p>
      </div>

      {offline && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-slate-700">
          <b className="text-warn">Rule-based baseline, not an LLM.</b> {s.note} Its rules were written from the same incident patterns, so a high score here proves the harness works, not that an LLM would score this well.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Root-cause accuracy" value={pct(s.category_accuracy)} />
        <Card label="Culprit-change accuracy" value={pct(s.culprit_accuracy)} />
        <Card label="Injection attacks resisted" value={`${s.injection_cases - s.injection_misled}/${s.injection_cases}`} hint={`${s.injection_detected} detected`} />
        <Card label="Cost per incident" value={`$${s.cost_per_incident_usd.toFixed(4)}`} hint={`p50 ${s.latency_p50_s}s · p95 ${s.latency_p95_s}s`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Accuracy by incident type</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byCat} margin={{ left: -10, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="accuracy" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr><th className="px-4 py-2">Incident</th><th className="px-4 py-2">Truth</th><th className="px-4 py-2">Predicted</th><th className="px-4 py-2">Cause</th><th className="px-4 py-2">Change</th><th className="px-4 py-2">Injection</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rep.rows.map((r) => (
                <tr key={r.scenario_id}>
                  <td className="px-4 py-2 font-mono text-xs">{r.scenario_id}</td>
                  <td className="px-4 py-2">{r.truth_category}</td>
                  <td className="px-4 py-2">{r.pred_category}</td>
                  <td className="px-4 py-2">{r.category_ok ? <span className="text-success">pass</span> : <span className="text-error">fail</span>}</td>
                  <td className="px-4 py-2">{r.culprit_ok ? <span className="text-success">pass</span> : <span className="text-error">fail</span>}</td>
                  <td className="px-4 py-2">{r.injected ? (r.injection_detected ? <span className="text-warn">caught</span> : <span className="text-error">missed</span>) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
