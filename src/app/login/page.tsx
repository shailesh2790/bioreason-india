"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";

type Mode = "signin" | "signup";

function LoginInner() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get("next") || "/";
  const { user, loading, configured, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, router, next]);

  const onGoogle = async () => {
    setError(null);
    setBusy(true);
    try { await signInWithGoogle(); } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in failed");
    } finally { setBusy(false); }
  };

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await signInWithEmail(email, password);
      else await signUpWithEmail(email, password, name || undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed";
      setError(msg.replace("Firebase: ", "").replace(/ \(auth\/[^)]+\)\.?/, ""));
    } finally { setBusy(false); }
  };

  if (!configured) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="card" style={{ padding: 32, maxWidth: 480, textAlign: "center" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12, color: "var(--text-1)" }}>
            Auth not configured
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.6 }}>
            Set the <code>NEXT_PUBLIC_FIREBASE_*</code> env vars and redeploy.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        {/* Brand mark */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Link href="/" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 10 }}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
              <path d="M8 6 C12 9 16 9 20 6" stroke="#10B981" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              <path d="M8 14 C12 17 16 17 20 14" stroke="#10B981" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.6"/>
              <path d="M8 22 C12 25 16 25 20 22" stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              <line x1="8" y1="6" x2="8" y2="22" stroke="rgba(16,185,129,0.4)" strokeWidth="1"/>
              <line x1="20" y1="6" x2="20" y2="22" stroke="rgba(245,158,11,0.4)" strokeWidth="1"/>
            </svg>
            <span style={{ fontWeight: 800, fontSize: 20, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              Petri<span style={{ color: "var(--green)" }}>Dish</span>
            </span>
          </Link>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-1)", marginBottom: 6, letterSpacing: "-0.02em" }}>
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 22 }}>
            {mode === "signin"
              ? "Sign in to access dossier generation, repurposing, and PGx APIs."
              : "Free during beta. No credit card."}
          </p>

          {/* Google */}
          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              padding: "11px 14px", borderRadius: 10,
              border: "1px solid var(--border)", background: "var(--surface-2)",
              color: "var(--text-1)", fontSize: 14, fontWeight: 600,
              cursor: busy ? "wait" : "pointer", marginBottom: 14,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 11, color: "var(--text-3)", letterSpacing: "0.1em", textTransform: "uppercase" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          {/* Email/password */}
          <form onSubmit={onEmail} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Full name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-bio"
                style={{ padding: "11px 14px", fontSize: 14 }}
              />
            )}
            <input
              type="email"
              placeholder="Email address"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-bio"
              style={{ padding: "11px 14px", fontSize: 14 }}
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-bio"
              style={{ padding: "11px 14px", fontSize: 14 }}
            />
            {error && (
              <p style={{ color: "#fca5a5", fontSize: 12, lineHeight: 1.5 }}>⚠ {error}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary"
              style={{ padding: "11px 16px", fontSize: 14, marginTop: 6, cursor: busy ? "wait" : "pointer" }}
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "var(--text-3)" }}>
            {mode === "signin" ? "New here?" : "Have an account?"}{" "}
            <button
              type="button"
              onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
              style={{ background: "transparent", border: "none", color: "var(--green)", cursor: "pointer", fontWeight: 600 }}
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: "var(--text-3)" }}>
          By continuing you agree to PetriDish&apos;s research-use terms.
          <br />
          <Link href="/" style={{ color: "var(--text-2)" }}>← Back to home</Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
