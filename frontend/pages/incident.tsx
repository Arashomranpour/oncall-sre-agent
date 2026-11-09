import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useApi, Job, Step } from "@/lib/api";
import { showToast } from "@/lib/toast";
import StatusBadge from "@/components/StatusBadge";

const AGENT: Record<string, { label: string; cls: string }> = {
  system: { label: "System", cls: "bg-slate-200 text-slate-700" },
  triage: { label: "Triage", cls: "bg-blue-100 text-primary" },
  investigator: { label: "Investigator", cls: "bg-violet-100 text-agent" },
  fixer: { label: "Fixer", cls: "bg-emerald-100 text-success" },
  guardrail: { label: "Guardrail", cls: "bg-amber-100 text-warn" },
};

export default function IncidentPage() {
  const api = useApi();
  const router = useRouter();
  const id = typeof router.query.id === "string" ? router.query.id : "";
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const j = await api.get<Job>(`/api/jobs/${id}`);
        if (!alive) return;
        setJob(j);
        if (j.status === "pending" || j.status === "running") timer = setTimeout(tick, 800);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    };
    tick();
    return () => { alive = false; clearTimeout(timer); };
  }, [api, id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [job?.steps.length]);

  async function decide(decision: "approve" | "reject") {
    setDeciding(true);
    try {
      const j = await api.post<Job>(`/api/jobs/${id}/decision`, { decision });
      setJob((old) => (old ? { ...old, ...j, alarm: old.alarm } : j));
      showToast("success", decision === "approve" ? "Approved. Simulated pull request created." : "Rejected. Nothing was applied.");
    } catch (e) {
      showToast("error", (e as Error).message);
    } finally {
      setDeciding(false);
    }
  }

  if (error) return <Notice title="Could not load this incident" body={error} />;
  if (!job) return <p className="py-20 text-center text-sm text-muted">Loading...</p>;

  const r = job.result;
  const working = job.status === "pending" || job.status === "running";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/" className="text-sm text-muted hover:underline">&larr; Dashboard</Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">{job.alarm.name}</h1>
          <p className="text-sm text-muted">{job.alarm.service} · {job.alarm.metric} · {job.alarm.region} · {job.scenario_id}</p>
        </div>
        <StatusBadge status={job.status} />
      </div>

      {r?.injection.detected && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-warn">Prompt injection detected and removed</p>
          <p className="mt-1 text-slate-700">A log line tried to take control of the agents. It was stripped before the agents saw it, and the agents cannot act on their own anyway.</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-xs text-slate-600">{r.injection.lines[0]}</pre>
        </div>
      )}
      {job.status === "failed" && <Notice title="The run failed" body={job.error ?? "Unknown error"} />}

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-200 bg-white lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-3 font-semibold">Agent timeline</div>
          <ol className="max-h-[34rem] space-y-3 overflow-y-auto p-5">
            {job.steps.map((s, i) => <StepRow key={i} s={s} />)}
            {working && (
              <li className="flex items-center gap-2 text-sm text-muted">
                <span className="h-2 w-2 animate-pulse rounded-full bg-agent" /> working...
              </li>
            )}
            <div ref={endRef} />
          </ol>
        </section>

        <div className="space-y-5 lg:col-span-3">
          {!r && <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-muted">Findings appear here when the agents finish.</div>}
          {r && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-semibold">Root cause</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
                    {r.triage.severity} · confidence {Math.round((r.investigation.confidence ?? 0) * 100)}%
                  </span>
                </div>
                <p className="mt-2 font-mono text-sm text-agent">{r.investigation.root_cause_category}</p>
                <p className="mt-1 text-sm text-slate-700">{r.investigation.summary}</p>
                {r.investigation.evidence.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {r.investigation.evidence.map((e, i) => (
                      <li key={i} className="overflow-x-auto rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-600">{e}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-xs text-muted">
                  {r.engine} · {r.metrics.latency_s}s · {r.metrics.tokens} tokens · ${r.metrics.cost_usd.toFixed(4)}
                </p>
              </section>

              {r.culprit && (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h2 className="font-semibold">Suspect change</h2>
                  <p className="mt-1 text-sm text-slate-700">{r.culprit.summary} <span className="text-muted">({r.culprit.id}, by {r.culprit.author})</span></p>
                  <Diff text={r.culprit.diff} />
                </section>
              )}

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="font-semibold">Proposed fix</h2>
                <p className="mt-1 text-sm font-medium">{r.fix.pr_title}</p>
                {r.fix.blocked && (
                  <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-error">Blocked by guardrails: {r.fix.block_reasons.join("; ")}</p>
                )}
                {r.fix.patch ? <Diff text={r.fix.patch} /> : <p className="mt-2 text-sm text-muted">No patch proposed. A human needs to investigate.</p>}

                {job.status === "awaiting_approval" && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      onClick={() => decide("approve")}
                      disabled={deciding || r.fix.blocked || !r.fix.patch}
                      className="rounded-lg bg-success px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Approve and open PR
                    </button>
                    <button
                      onClick={() => decide("reject")}
                      disabled={deciding}
                      className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium hover:bg-slate-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
                {job.approval && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
                    {job.approval.decision === "approve" ? (
                      <>Approved by <b>{job.approval.by}</b>. Simulated PR: <span className="font-mono text-xs">{job.approval.pr_url}</span>
                        <p className="mt-1 text-xs text-muted">Simulated link for the demo. A production setup would open it through the GitHub API.</p></>
                    ) : (
                      <>Rejected by <b>{job.approval.by}</b>. Nothing was applied.</>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepRow({ s }: { s: Step }) {
  const a = AGENT[s.agent] ?? AGENT.system;
  const mono = s.kind === "tool_call" || s.kind === "tool_result";
  return (
    <li className="step-in text-sm">
      <span className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${a.cls}`}>{a.label}</span>
      {s.kind === "tool_call" && <span className="font-mono text-xs text-primary">&rarr; {s.text}</span>}
      {s.kind === "tool_result" && (
        <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-600">{s.text}</pre>
      )}
      {!mono && <span className={s.kind === "thought" ? "italic text-slate-600" : s.kind === "warning" ? "text-warn" : "font-medium"}>{s.text}</span>}
    </li>
  );
}

function Diff({ text }: { text: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed">
      {text.split("\n").map((l, i) => (
        <div key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "text-emerald-300" : l.startsWith("-") && !l.startsWith("---") ? "text-red-300" : l.startsWith("@@") ? "text-sky-300" : "text-slate-400"}>
          {l || " "}
        </div>
      ))}
    </pre>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5">
      <p className="font-semibold text-error">{title}</p>
      <p className="mt-1 text-sm text-slate-700">{body}</p>
      <Link href="/" className="mt-3 inline-block text-sm underline">Back to dashboard</Link>
    </div>
  );
}
