"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getWebAuthSession, setUserChangedListener } from "@/lib/auth/session";
import { loginReturnTo, type WebAuthSession, type WebAuthState } from "@/lib/auth/web-auth-session";
import { LoginView } from "./login-view";

const LOADING: WebAuthState = { status: "loading" };
const getLoading = () => LOADING;
const noopSubscribe = () => () => undefined;
const AuthContext = createContext<WebAuthSession | null>(null);

export function useAuthSession(): WebAuthSession {
  const session = useContext(AuthContext);
  if (!session) throw new Error("useAuthSession must be used inside AuthGate");
  return session;
}

export function useAuthState(): WebAuthState {
  const session = useAuthSession();
  return useSyncExternalStore(session.subscribe, session.getState, getLoading);
}

/** The browser session; null while rendering on the server (tokens and storage exist only in the browser). */
function useBrowserSession(): WebAuthSession | null {
  return useSyncExternalStore(noopSubscribe, getWebAuthSession, () => null);
}

/**
 * AUTH-001 on the Web: nothing of the app renders until the user is known. Signed out, every route shows the
 * login (and returns to that route afterwards); /auth/callback finishes a login on its own.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useBrowserSession();
  const state = useSyncExternalStore(session?.subscribe ?? noopSubscribe, session?.getState ?? getLoading, getLoading);
  const pathname = usePathname();
  const router = useRouter();
  const isCallback = pathname.startsWith("/auth/callback");

  // Before any screen renders for another user, drop every cached query of the previous one.
  useLayoutEffect(() => {
    setUserChangedListener(() => {
      void queryClient.cancelQueries();
      queryClient.clear();
    });
  }, [queryClient]);

  useEffect(() => {
    if (session && !isCallback) void session.bootstrap();
  }, [isCallback, session]);

  useEffect(() => {
    if (state.status === "signedIn" && pathname === "/login") router.replace("/today");
  }, [state.status, pathname, router]);

  let content: ReactNode;
  if (isCallback && session) {
    content = children;
  } else if (!session || state.status === "loading" || (state.status === "signedIn" && pathname === "/login")) {
    content = <AuthSplash />;
  } else if (state.status === "signedOut") {
    // The session only exists in the browser, so window.location is available here. The query is part of the
    // route (filters, search, deep links); usePathname alone would drop it.
    content = <LoginView returnTo={loginReturnTo(pathname, window.location.search)} message={state.message} />;
  } else {
    content = <AppShell>{children}</AppShell>;
  }
  return <AuthContext.Provider value={session}>{content}</AuthContext.Provider>;
}

function AuthSplash() {
  return (
    <div className="auth-page auth-splash" role="status" aria-live="polite">
      <div className="app-mark" aria-hidden="true">
        D
      </div>
      <div className="auth-brand">
        Day<span>Flow</span>
      </div>
      <div className="mini">불러오는 중…</div>
    </div>
  );
}
