"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function NavAuth() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (loading) {
    return <div style={{ width: 32, height: 32, borderRadius: 16, background: "var(--surface-2)" }} />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          padding: "6px 14px",
          borderRadius: 8,
          textDecoration: "none",
          background: "var(--green)",
          color: "#032018",
          whiteSpace: "nowrap",
        }}
      >
        Sign in
      </Link>
    );
  }

  const initials = (user.displayName || user.email || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={user.email || ""}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text-1)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 800,
          padding: 0,
          overflow: "hidden",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.photoURL} alt="" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            width: 240,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            zIndex: 60,
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", marginBottom: 2, wordBreak: "break-word" }}>
              {user.displayName || "User"}
            </p>
            <p style={{ fontSize: 11, color: "var(--text-3)", wordBreak: "break-all" }}>{user.email}</p>
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            style={{
              display: "block",
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--text-2)",
              textDecoration: "none",
            }}
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={async () => {
              setOpen(false);
              await signOut();
              router.push("/");
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 14px",
              fontSize: 13,
              color: "var(--red)",
              background: "transparent",
              border: "none",
              borderTop: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
