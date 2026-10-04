"use client";

import { Suspense, useState } from "react";
import { signIn, signOut, useSession, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/brand/Logo";
import { BRAND } from "@/lib/brand";

const ROLE_LABEL: Record<string, string> = { CUSTOMER: "customer", VENDOR: "vendor", ADMIN: "admin" };

function homeFor(role?: string) {
  if (role === "VENDOR") return "/vendor/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/";
}

/** Only same-site relative paths, so ?callbackUrl can't send users elsewhere. */
function safeCallback(raw: string | null) {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return null;
  return raw;
}

function areaNeeded(callbackUrl: string | null) {
  if (callbackUrl?.startsWith("/vendor")) return { page: "the vendor dashboard", role: "vendor" };
  if (callbackUrl?.startsWith("/admin")) return { page: "the admin area", role: "admin" };
  return null;
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: session, status } = useSession();
  const callbackUrl = safeCallback(params.get("callbackUrl"));
  const wrongRole = params.get("reason") === "role";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError("Invalid email or password.");
      return;
    }
    const fresh = await getSession();
    const needed = areaNeeded(callbackUrl);
    // Only return to the requested page if the new account can open it.
    const target =
      callbackUrl && (!needed || ROLE_LABEL[fresh?.user?.role ?? ""] === needed.role)
        ? callbackUrl
        : homeFor(fresh?.user?.role);
    router.replace(target);
    router.refresh();
  }

  async function switchAccount() {
    setSwitching(true);
    await signOut({ redirect: false });
    setSwitching(false);
    router.refresh();
  }

  if (status === "loading") {
    return <div className="max-w-sm mx-auto card p-6 text-ink-muted">Loading…</div>;
  }

  // Already logged in: explain instead of showing a form they don't need.
  if (session?.user) {
    const needed = wrongRole ? areaNeeded(callbackUrl) : null;
    const current = ROLE_LABEL[session.user.role] ?? "current";
    return (
      <div className="max-w-sm mx-auto card p-6">
        <h1 className="font-display text-2xl text-ink mb-2">You're logged in</h1>
        <p className="text-sm text-ink-muted">
          Logged in as <span className="font-medium text-ink">{session.user.name || session.user.email}</span>
          {session.user.name && <> ({session.user.email})</>} with a {current} account.
        </p>
        {needed && (
          <p className="text-sm text-accent-dark bg-accent-light rounded px-3 py-2 mt-3">
            {needed.page.charAt(0).toUpperCase() + needed.page.slice(1)} needs a {needed.role} account. Log out and log
            in with your {needed.role} account to open it.
          </p>
        )}
        <div className="flex flex-col gap-2 mt-5">
          <Link href={homeFor(session.user.role)} className="btn-primary w-full text-center">
            {session.user.role === "CUSTOMER" ? "Continue shopping" : "Go to my dashboard"}
          </Link>
          <button className="btn-secondary w-full" onClick={switchAccount} disabled={switching}>
            {switching ? "Logging out…" : "Log out and use another account"}
          </button>
        </div>
      </div>
    );
  }

  const needed = areaNeeded(callbackUrl);
  return (
    <div className="max-w-sm mx-auto">
      <div className="flex justify-center mb-5">
        <Link href="/" aria-label={`${BRAND.name} home`}>
          <Logo variant="stacked" size={64} />
        </Link>
      </div>
    <div className="card p-6">
      <h1 className="font-display text-2xl text-ink mb-1">Log in to {BRAND.name}</h1>
      {needed && <p className="text-sm text-ink-muted mb-3">Log in with your {needed.role} account to open {needed.page}.</p>}
      <form onSubmit={submit} className="space-y-3 mt-3">
        <input
          className="input"
          type="email"
          placeholder="Email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="text-sm text-ink-muted mt-4">
        No account?{" "}
        <Link href="/register" className="text-brand hover:underline">
          Sign up
        </Link>
      </p>
    </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-sm mx-auto card p-6 text-ink-muted">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
