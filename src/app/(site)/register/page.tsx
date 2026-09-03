"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole] = useState<"CUSTOMER" | "VENDOR">("CUSTOMER");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    storeName: "",
    storeDescription: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role }),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? "Registration failed.");
      return;
    }

    if (role === "VENDOR") {
      setNotice(data.message ?? "Vendor account created. Awaiting admin approval.");
      return;
    }

    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    if (!signInRes?.error) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="max-w-md mx-auto card p-6">
      <h1 className="font-display text-2xl text-ink mb-4">Create an account</h1>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          className={`flex-1 rounded px-3 py-2 text-sm ${role === "CUSTOMER" ? "bg-brand text-white" : "bg-ink/[0.06]"}`}
          onClick={() => setRole("CUSTOMER")}
        >
          Shop as a customer
        </button>
        <button
          type="button"
          className={`flex-1 rounded px-3 py-2 text-sm ${role === "VENDOR" ? "bg-brand text-white" : "bg-ink/[0.06]"}`}
          onClick={() => setRole("VENDOR")}
        >
          Sell as a vendor
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <input
          className="input"
          placeholder="Full name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
          minLength={8}
        />

        {role === "VENDOR" && (
          <>
            <input
              className="input"
              placeholder="Store name"
              value={form.storeName}
              onChange={(e) => setForm({ ...form, storeName: e.target.value })}
              required
            />
            <textarea
              className="input"
              placeholder="Store description (optional)"
              value={form.storeDescription}
              onChange={(e) => setForm({ ...form, storeDescription: e.target.value })}
            />
          </>
        )}

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {notice && <p className="text-green-700 text-sm">{notice}</p>}

        <button className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </div>
  );
}
