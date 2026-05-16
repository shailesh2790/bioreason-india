"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && configured && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
    }
  }, [loading, configured, user, router, pathname]);

  // If Firebase isn't configured at all, don't hard-block (local dev / preview)
  if (!configured) return <>{children}</>;

  if (loading) {
    return (
      <main style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            border: "3px solid var(--border)", borderTopColor: "var(--green)",
            margin: "0 auto 14px", animation: "rotate-slow 0.9s linear infinite",
          }} />
          <p style={{ color: "var(--text-3)", fontSize: 13 }}>Checking session…</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <p style={{ color: "var(--text-1)", fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
            Sign in required
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 13, marginBottom: 18 }}>
            This module is part of the PetriDish workbench. Redirecting to sign in…
          </p>
          <a href={`/login?next=${encodeURIComponent(pathname || "/")}`} className="btn-primary"
             style={{ padding: "9px 22px", fontSize: 13, textDecoration: "none", display: "inline-block" }}>
            Go to sign in →
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
