import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "BioReason — India's Biomedical Intelligence Platform",
  description:
    "Multi-hop reasoning over 4.3M biomedical relationships, extended with Indian population genomics, 17,967 Ayurvedic compounds, and medical image analysis.",
};

const NAV_LINKS = [
  { href: "/query",            label: "Query",        color: "hover:text-emerald-400" },
  { href: "/twin",             label: "Twin",         color: "hover:text-cyan-400",   hot: true },
  { href: "/vision",           label: "Vision",       color: "hover:text-cyan-400" },
  { href: "/hypothesis",       label: "Hypothesis",   color: "hover:text-yellow-400" },
  { href: "/repurpose",        label: "Repurpose",    color: "hover:text-blue-400" },
  { href: "/validate",         label: "Ayurveda",     color: "hover:text-orange-400" },
  { href: "/pharmacogenomics", label: "PGx",          color: "hover:text-purple-400" },
  { href: "/synergy",          label: "Synergy",      color: "hover:text-cyan-400" },
  { href: "/alerts",           label: "Alerts",       color: "hover:text-red-400",    alert: true },
  { href: "/batch",            label: "Batch",        color: "hover:text-emerald-400" },
  { href: "/search",           label: "Search",       color: "hover:text-blue-400" },
  { href: "/api-docs",         label: "API",          color: "hover:text-emerald-400" },
  { href: "/graph",            label: "Graph",        color: "hover:text-purple-400" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body style={{ background: "var(--bg)", minHeight: "100vh" }}>

        {/* Navigation */}
        <nav style={{
          borderBottom: "1px solid var(--border)",
          background: "rgba(3, 11, 20, 0.85)",
          backdropFilter: "blur(20px)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <div style={{ maxWidth: 1280, margin: "0 auto", padding: "0 20px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>

            {/* Logo */}
            <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", flexShrink: 0 }}>
              {/* DNA helix icon */}
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <circle cx="14" cy="14" r="13" stroke="rgba(16,185,129,0.3)" strokeWidth="1" />
                <path d="M8 6 C12 9 16 9 20 6" stroke="#10B981" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <path d="M8 10 C12 13 16 13 20 10" stroke="#10B981" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M8 14 C12 17 16 17 20 14" stroke="#10B981" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5"/>
                <path d="M8 18 C12 21 16 21 20 18" stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7"/>
                <path d="M8 22 C12 25 16 25 20 22" stroke="#F59E0B" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                <line x1="8" y1="6" x2="8" y2="22" stroke="rgba(16,185,129,0.4)" strokeWidth="1"/>
                <line x1="20" y1="6" x2="20" y2="22" stroke="rgba(245,158,11,0.4)" strokeWidth="1"/>
              </svg>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.02em", color: "var(--text-1)" }}>
                Bio<span style={{ color: "var(--green)" }}>Reason</span>
              </span>
            </Link>

            {/* Links */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, overflowX: "auto" }}>
              {NAV_LINKS.map(({ href, label, alert, hot }) => (
                <Link
                  key={href}
                  href={href}
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    padding: "5px 10px",
                    borderRadius: 7,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    transition: "all 0.15s",
                    color: alert ? "var(--red)" : "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                  className={alert ? "hover:bg-red-950/30" : "hover:bg-[var(--surface-2)] hover:text-[var(--text-1)]"}
                >
                  {alert && <span style={{ fontSize: 10 }}>⚠</span>}
                  {hot && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--cyan)", display: "inline-block", animation: "pulse-glow 2s infinite", flexShrink: 0 }} />}
                  {label}
                </Link>
              ))}
            </div>

          </div>
        </nav>

        {children}

      </body>
    </html>
  );
}
