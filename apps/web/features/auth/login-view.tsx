"use client";

import { useState, type FormEvent } from "react";
import { devLoginEnabled, getWebAuthSession } from "@/lib/auth/session";

/** AUTH-001: the only screen before sign-in. Google is the first (and today the only) way in. */
export function LoginView({ returnTo, message }: { returnTo: string | null; message: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async (run: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await run();
    } catch {
      setPending(false);
      setError("로그인을 시작하지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  };

  return (
    <main className="auth-page">
      <section className="card auth-card" aria-labelledby="login-title">
        <div className="auth-brand">
          Day<span>Flow</span>
        </div>
        <h1 id="login-title" className="auth-title">
          목표를 향해, 다시 시작하는 하루
        </h1>
        <p className="auth-copy">계획이 흔들려도 다시 목표로 돌아올 수 있게. 로그인하면 Web과 Mobile에서 같은 계획을 이어가요.</p>
        {message && (
          <div className="notice error" role="alert">
            {message}
          </div>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <button
          type="button"
          className="btn google-btn"
          disabled={pending}
          onClick={() => void start(() => getWebAuthSession().startGoogleLogin(returnTo))}
        >
          <GoogleMark />
          {pending ? "Google로 이동 중…" : "Google로 계속하기"}
        </button>
        <p className="mini auth-note">Google 계정의 이름, 이메일, 프로필 사진만 사용해요.</p>
        {devLoginEnabled && <DevLoginForm returnTo={returnTo} disabled={pending} onStart={start} />}
      </section>
    </main>
  );
}

/** Development only: signs in through the API's dev login instead of Google (see apps/web/README.md). */
function DevLoginForm({
  returnTo,
  disabled,
  onStart,
}: {
  returnTo: string | null;
  disabled: boolean;
  onStart: (run: () => Promise<void>) => Promise<void>;
}) {
  const [subject, setSubject] = useState("user-a");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void onStart(() => getWebAuthSession().startDevLogin(subject, `${subject}@dayflow.dev`, returnTo));
  };
  return (
    <form className="auth-dev" onSubmit={submit}>
      <div className="section-label">개발용 로그인</div>
      <label className="field">
        <span className="field-label">테스트 사용자 ID</span>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} pattern="[a-z0-9-]{1,40}" required />
      </label>
      <button type="submit" className="btn ghost small" disabled={disabled}>
        개발용 로그인
      </button>
    </form>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.7-4.1-13.5-9.8l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
