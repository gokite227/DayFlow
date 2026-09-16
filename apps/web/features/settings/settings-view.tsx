"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { useAuthSession, useAuthState } from "@/features/auth/auth-provider";

/** AUTH-005: who is signed in, and logging out of this browser. */
export function SettingsView() {
  const state = useAuthState();
  const session = useAuthSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  if (state.status !== "signedIn") return null;
  const { user } = state;

  const logout = async () => {
    setPending(true);
    await session.logout();
    router.replace("/login");
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="계정" />
      <section className="card profile-card" aria-label="내 계정">
        {user.avatarUrl ? (
          // Google profile images are small external URLs; next/image would need a remote pattern for them.
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
            {user.displayName.slice(0, 1)}
          </div>
        )}
        <div className="profile-text">
          <div className="profile-name">{user.displayName}</div>
          <div className="mini">{user.email}</div>
          <div className="mini">Google로 로그인됨</div>
        </div>
        <button type="button" className="btn danger" disabled={pending} onClick={() => void logout()}>
          {pending ? "로그아웃 중…" : "로그아웃"}
        </button>
      </section>
      <p className="mini settings-note">로그아웃하면 이 브라우저에서만 DayFlow 세션이 끝나요. Google 계정은 로그아웃되지 않아요.</p>
    </>
  );
}
