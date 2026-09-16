"use client";

import { describeLoginError } from "@dayflow/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getWebAuthSession } from "@/lib/auth/session";
import { LoginCallbackError } from "@/lib/auth/web-auth-session";

/** AUTH-001: the API sends the browser here with a one-time code (never a token). */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getWebAuthSession()
      .completeLogin(window.location.href)
      .then((route) => {
        // replace: the callback URL with its used code never stays in the history.
        if (active) router.replace(route);
      })
      .catch((reason: unknown) => {
        if (active) setError(describeLoginError(reason instanceof LoginCallbackError ? reason.reason : "unknown"));
      });
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="auth-page">
      <section className="card auth-card" aria-live="polite">
        <div className="auth-brand">
          Day<span>Flow</span>
        </div>
        {error ? (
          <>
            <div className="notice error" role="alert">
              {error}
            </div>
            <Link className="btn" href="/login">
              다시 로그인하기
            </Link>
          </>
        ) : (
          <div className="mini" role="status">
            로그인하는 중…
          </div>
        )}
      </section>
    </main>
  );
}
