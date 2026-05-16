"use client";

import { usePathname } from "next/navigation";
import RequireAuth from "./RequireAuth";

// Routes that require a signed-in user. Everything else is public.
const PROTECTED_PREFIXES = [
  "/herbcheck",
  "/validate",
  "/repurpose",
  "/rare",
  "/twin",
  "/vision",
  "/hypothesis",
  "/synergy",
  "/batch",
  "/pharmacogenomics",
  "/pgx-api",
  "/query",
  "/compare",
  "/dashboard",
];

export default function ProtectedGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isProtected) return <RequireAuth>{children}</RequireAuth>;
  return <>{children}</>;
}
