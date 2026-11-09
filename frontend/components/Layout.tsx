import Link from "next/link";
import { useRouter } from "next/router";
import { ReactNode } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { CLERK_ENABLED } from "@/lib/auth";
import ToastHost from "./Toast";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/evals", label: "Evals" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useRouter();
  const body = <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-ink text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm">SRE</span>
            On-Call SRE Agent
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 ${pathname === n.href ? "bg-white/15" : "text-slate-300 hover:bg-white/10"}`}
              >
                {n.label}
              </Link>
            ))}
            {CLERK_ENABLED && (
              <span className="ml-2">
                <SignedIn><UserButton /></SignedIn>
              </span>
            )}
          </nav>
        </div>
      </header>

      {CLERK_ENABLED ? (
        <>
          <SignedIn>{body}</SignedIn>
          <SignedOut>
            <main className="mx-auto max-w-xl flex-1 px-4 py-24 text-center">
              <h1 className="text-2xl font-semibold">Sign in to triage incidents</h1>
              <p className="mt-2 text-muted">Agents investigate alarms and propose fixes. Every fix needs your approval.</p>
              <SignInButton mode="modal">
                <button className="mt-6 rounded-lg bg-primary px-5 py-2.5 font-medium text-white">Sign in</button>
              </SignInButton>
            </main>
          </SignedOut>
        </>
      ) : (
        body
      )}

      <footer className="border-t border-slate-200 px-4 py-4 text-center text-xs text-muted">
        Simulated incidents. Fixes are proposals only and are never applied automatically. &copy; On-Call SRE Agent by Arash Omranpour &middot;{" "}
        <a className="underline" href="mailto:arashomranpour@gmail.com">arashomranpour@gmail.com</a>
      </footer>
      <ToastHost />
    </div>
  );
}
