import { Status } from "@/lib/api";

const MAP: Record<Status, { label: string; cls: string }> = {
  pending: { label: "Queued", cls: "bg-slate-100 text-slate-600" },
  running: { label: "Agents working", cls: "bg-violet-100 text-agent" },
  awaiting_approval: { label: "Needs your approval", cls: "bg-amber-100 text-warn" },
  approved: { label: "Approved", cls: "bg-emerald-100 text-success" },
  rejected: { label: "Rejected", cls: "bg-slate-200 text-slate-700" },
  failed: { label: "Failed", cls: "bg-red-100 text-error" },
};

export default function StatusBadge({ status }: { status: Status }) {
  const m = MAP[status] ?? MAP.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.cls}`}>
      {status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-agent" />}
      {m.label}
    </span>
  );
}
