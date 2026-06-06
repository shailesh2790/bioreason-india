"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from "react";
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
  browserPopupRedirectResolver,
} from "firebase/auth";
import { getFirebase, googleProvider, isFirebaseConfigured } from "./firebase";

// Mobile / in-app browser detection — these environments either block popups
// outright (Safari iOS), close them synchronously, or live inside webviews
// (Instagram, LinkedIn, FB Messenger) that cannot host the OAuth popup at all.
function shouldUseRedirectFlow(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
  const isInAppBrowser =
    /Instagram|FBAN|FBAV|Line|Twitter|LinkedIn|WhatsApp|MicroMessenger/i.test(ua);
  const isNarrow = window.innerWidth < 768;
  return isMobileUA || isInAppBrowser || isNarrow;
}

export interface AuthState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<User>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  fetchWithAuth: (input: RequestInfo, init?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }
    const { auth } = getFirebase();
    if (!auth) {
      setLoading(false);
      return;
    }

    // Process any redirect-result FIRST (mobile/in-app browsers come back
    // here via signInWithRedirect). This must run before onAuthStateChanged
    // resolves the initial state so the redirected user is captured.
    let cancelled = false;
    getRedirectResult(auth, browserPopupRedirectResolver)
      .catch((e) => {
        // Most "no redirect pending" outcomes throw with no operation —
        // silently swallow; real errors bubble up via the login page error
        // state when the user re-tries.
        if (typeof console !== "undefined" && e?.code && e.code !== "auth/no-auth-event") {
          console.warn("[auth] redirect-result error:", e.code, e.message);
        }
      });

    const unsub = onAuthStateChanged(auth, (u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    return () => { cancelled = true; unsub(); };
  }, [configured]);

  const signInWithGoogle = useCallback(async () => {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Firebase not configured");

    // Mobile / in-app browser: skip popup entirely, go straight to redirect.
    // The page will navigate away to Google's sign-in URL, then come back
    // to /login (or wherever) — getRedirectResult on next mount handles it.
    if (shouldUseRedirectFlow()) {
      await signInWithRedirect(auth, googleProvider);
      // Promise never resolves here — page is navigating away. Returning a
      // never-resolving sentinel so the caller's `await` doesn't crash.
      return new Promise<User>(() => {});
    }

    // Desktop: try popup first, fall back to redirect if the popup is
    // blocked or the user closes it (Chrome on macOS sometimes does this).
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return cred.user;
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        await signInWithRedirect(auth, googleProvider);
        return new Promise<User>(() => {});
      }
      throw e;
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Firebase not configured");
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, displayName?: string) => {
    const { auth } = getFirebase();
    if (!auth) throw new Error("Firebase not configured");
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      try { await updateProfile(cred.user, { displayName }); } catch {}
    }
    return cred.user;
  }, []);

  const signOut = useCallback(async () => {
    const { auth } = getFirebase();
    if (!auth) return;
    await fbSignOut(auth);
  }, []);

  const getIdToken = useCallback(async () => {
    const { auth } = getFirebase();
    if (!auth || !auth.currentUser) return null;
    return auth.currentUser.getIdToken();
  }, []);

  const fetchWithAuth = useCallback(async (input: RequestInfo, init: RequestInit = {}) => {
    const { auth } = getFirebase();
    const headers = new Headers(init.headers || {});
    if (auth?.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        if (token) headers.set("Authorization", `Bearer ${token}`);
      } catch { /* fall through — request will 401 and UI handles it */ }
    }
    return fetch(input, { ...init, headers });
  }, []);

  const value = useMemo(
    () => ({ user, loading, configured, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, getIdToken, fetchWithAuth }),
    [user, loading, configured, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut, getIdToken, fetchWithAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
