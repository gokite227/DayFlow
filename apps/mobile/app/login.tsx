import { describeLoginError } from "@dayflow/api-client";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MobileLoginError } from "@/features/auth/mobile-auth-session";
import { useAuthSession, useAuthState } from "@/features/auth/use-auth";
import { Button, Notice } from "@/ui/components";
import { fontSize, makeStyles, radius, spacing } from "@/ui/theme";

/** AUTH-001: the only screen before sign-in. Google login runs in the system browser. */
export default function LoginScreen() {
  const styles = useStyles();
  const session = useAuthSession();
  const auth = useAuthState();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setPending(true);
    setError(null);
    try {
      await session.signInWithGoogle();
    } catch (reason) {
      setError(
        reason instanceof MobileLoginError
          ? describeLoginError(reason.reason)
          : "로그인하지 못했어요. 인터넷 연결과 API 주소를 확인한 뒤 다시 시도해주세요.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Text style={styles.brand}>
          Day<Text style={styles.brandAccent}>Flow</Text>
        </Text>
        <View style={styles.card}>
          <Text style={styles.title}>목표를 향해, 다시 시작하는 하루</Text>
          <Text style={styles.body}>계획이 흔들려도 다시 목표로 돌아올 수 있게. 로그인하면 Web과 Mobile에서 같은 계획을 이어가요.</Text>
          {auth.status === "signedOut" && auth.message ? <Notice tone="warning">{auth.message}</Notice> : null}
          {auth.status === "offline" ? (
            <Notice tone="warning" action={<Button label="다시 연결" small variant="secondary" onPress={() => void session.bootstrap()} />}>
              서버에 연결할 수 없어요. 로그인 정보는 이 기기에 그대로 있어요.
            </Notice>
          ) : null}
          {error ? <Notice tone="warning">{error}</Notice> : null}
          <Button label={pending ? "Google로 이동 중…" : "Google로 계속하기"} disabled={pending} onPress={() => void signIn()} />
          <Text style={styles.muted}>Google 계정의 이름, 이메일, 프로필 사진만 사용해요.</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((palette) => ({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { flex: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.lg },
  brand: { fontSize: 30, fontWeight: "800", color: palette.text, textAlign: "center" },
  brandAccent: { color: palette.accent },
  card: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  title: { fontSize: fontSize.title, fontWeight: "800", color: palette.text },
  body: { fontSize: fontSize.body, lineHeight: 22, color: palette.textSecondary },
  muted: { fontSize: fontSize.caption, color: palette.textSecondary, textAlign: "center" },
}));
