import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi, EvalReport, Health, JobRow, Scenario } from "@/lib/api";
import { showToast } from "@/lib/toast";
import StatusBadge from "@/components/StatusBadge";

const INJECTION_DEMO = "inc-003"; // logs of this incident contain a prompt-injection line

export default function Dashboard() {
  const api = useApi();
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [evals, setEvals] = useState<EvalReport | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [llmKey, setLlmKey] = useState("");

  // Bring-your-own-key: stays in this browser, is sent only with "Run agents", and is never stored server-side.
  useEffect(() => {
    try { setLlmKey(localStorage.getItem("llm_key") ?? ""); } catch {}
  }, []);
  function saveKey(v: string) {
    setLlmKey(v);
    try { v ? localStorage.setItem("llm_key", v) : localStorage.removeItem("llm_key"); } catch {}
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [h, s, j] = await Promise.all([
          api.get<Health>("/api/health"),
          api.get<Scenario[]>("/api/scenarios"),
          api.get<JobRow[]>("/api/jobs"),
        ]);
        if (!alive) return;
        setHealth(h); setScenarios(s); setJobs(j); setSelected(s[0]?.id ?? "");
      } catch (e) {
        if (alive) { setOffline(true); showToast("error", "Cannot reach the API. Is the backend running on :8000?"); }
      }
      try { const ev = await api.get<EvalReport>("/api/evals/latest"); if (alive) setEvals(ev); } catch {}
    })();
    const t = setInterval(() => api.get<JobRow[]>("/api/jobs").then((j) => alive && setJobs(j)).catch(() => {}), 3000);
    return () => { alive = false; clearInterval(t); };
  }, [api]);

  async function run(id: string) {
    setBusy(true);
    try {
      const job = await api.post<{ id: string }>("/api/jobs", { scenario_id: id }, llmKey ? { "X-LLM-Key": llmKey } : {});
      router.push(`/incident?id=${job.id}`);
    } catch (e) {
      showToast("error", (e as Error).message);
      setBusy(false);
    }
  }

  const awaiting = jobs.filter((j) => j.status === "awaiting_approval").length;
  const pct = (x: number) => `${Math.round(x * 100)}%`;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-ink p-6 text-white sm:p-8">
        <p className="text-sm font-medium text-blue-300">Human-in-the-loop incident response</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">An alarm just fired. Let the agents take the first pass.</h1>
        <p className="mt-2 max-w-2xl text-slate-300">
          Triage, investigate with read-only tools, and propose a fix as a pull request. Nothing is applied until you approve it.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={offline}
            aria-label="Incident to run"
            className="min-w-0 flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id} className="text-ink">
                {s.id} · {s.alarm.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => run(selected)}
            disabled={busy || !selected}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? "Starting..." : "Run agents"}
          </button>
          <button
            onClick={() => run(INJECTION_DEMO)}
            disabled={busy || offline}
            className="rounded-lg border border-amber-400/60 px-4 py-2.5 text-sm font-medium text-amber-300 hover:bg-white/10 disabled:opacity-50"
            title="This incident's logs contain a prompt-injection attack"
          >
            Try an injection attack
          </button>
        </div>
        <label className="mt-4 block text-xs text-slate-300">
          Groq API key (optional): run live LLM agents with your own key. It stays in this browser and is used only for your runs.
          <input
            type="password"
            value={llmKey}
            onChange={(e) => saveKey(e.target.value.trim())}
            placeholder="gsk_... (leave empty for the rule-based demo engine)"
            autoComplete="off"
            className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
        </label>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Agent engine" value={health ? health.engine : "..."} hint={health?.engine.startsWith("offline") ? "Rule-based demo engine, no API key" : "Live LLM agents"} />
        <Stat label="Root-cause accuracy" value={evals ? pct(evals.summary.category_accuracy) : "n/a"} hint={evals ? `${evals.summary.total} incidents, ${evals.summary.engine}` : "Run the eval harness"} />
        <Stat label="Waiting for approval" value={String(awaiting)} hint="Fixes proposed by agents" />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 font-semibold">Recent runs</div>
        {jobs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No runs yet. Pick an incident above and press Run agents.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/incident?id=${j.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{j.alarm.name}</p>
                    <p className="text-xs text-muted">
                      {j.scenario_id} · {j.root_cause ?? "investigating"} · {new Date(j.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{hint}</p>
    </div>
  );
}
