import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { API_BASE_URL_ENV, describeApiConfigProblem, type ApiConfig } from "@/config/api-config";
import { fontSize, makeStyles, radius, spacing } from "@/ui/theme";

/** Shown instead of the app when the API origin is missing or invalid (development setup problem). */
export function ConfigErrorScreen({ config }: { config: Extract<ApiConfig, { ok: false }> }) {
  const styles = useStyles();
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>API 주소가 필요해요</Text>
        <Text style={styles.body}>{describeApiConfigProblem(config)}</Text>
        <View style={styles.code}>
          <Text style={styles.codeText}>{`# apps/mobile/.env.local\n${API_BASE_URL_ENV}=http://<컴퓨터 IP>:8080`}</Text>
        </View>
        <Text style={styles.muted}>
          실제 기기에서 localhost는 휴대폰 자신을 가리켜요. 같은 Wi-Fi의 컴퓨터 IP를 쓰고, Android 에뮬레이터는 10.0.2.2를 써요. 값을 바꾼 뒤에는 개발 서버를
          다시 시작해야 반영돼요.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((palette) => ({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  title: { fontSize: fontSize.heading, fontWeight: "800", color: palette.text },
  body: { fontSize: fontSize.body, color: palette.text, lineHeight: 22 },
  muted: { fontSize: fontSize.caption + 1, color: palette.textSecondary, lineHeight: 19 },
  code: { backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.border, padding: spacing.md },
  codeText: { fontFamily: "monospace", fontSize: fontSize.caption + 1, color: palette.text },
}));