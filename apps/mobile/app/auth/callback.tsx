import { describeLoginError } from "@dayflow/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { MOBILE_REDIRECT_URI, MobileLoginError } from "@/features/auth/mobile-auth-session";
import { useAuthSession } from "@/features/auth/use-auth";
import { Button, EmptyState, LoadingState, Notice, Screen } from "@/ui/components";

/**
 * `dayflow://auth/callback?code=…`. iOS returns the redirect straight to the login screen; Android may also open
 * this route. The exchange runs once per code, whoever gets there first.
 */
export default function AuthCallbackScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session.getState().status === "signedIn") {
      router.replace("/today");
      return;
    }
    const query = new URLSearchParams();
    if (typeof params.code === "string") query.set("code", params.code);
    if (typeof params.error === "string") query.set("error", params.error);
    let active = true;
    session
      .completeLogin(`${MOBILE_REDIRECT_URI}?${query.toString()}`)
      .then(() => {
        if (active) router.replace("/today");
      })
      .catch((reason: unknown) => {
        if (active) setError(describeLoginError(reason instanceof MobileLoginError ? reason.reason : "unknown"));
      });
    return () => {
      active = false;
    };
  }, [params.code, params.error, router, session]);

  return (
    <Screen>
      {error ? (
        <>
          <Notice tone="warning">{error}</Notice>
          <Button label="로그인 화면으로" onPress={() => router.replace("/login")} />
        </>
      ) : (
        <>
          <LoadingState label="로그인하는 중…" />
          <EmptyState>잠시만 기다려주세요.</EmptyState>
        </>
      )}
    </Screen>
  );
}
