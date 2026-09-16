import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { describeError } from "@/lib/api-error";
import { TOUCH_TARGET, fontSize, makeStyles, radius, spacing, useAppTheme, usePalette } from "./theme";

/** A scrolling page with pull-to-refresh and keyboard avoidance; headers come from the navigator. */
export function Screen({ children, refreshing, onRefresh }: { children: ReactNode; refreshing?: boolean; onRefresh?: () => void }) {
  const styles = useStyles();
  const palette = usePalette();
  return (
    <KeyboardAvoidingView style={[styles.flex, styles.screen]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.screenContent}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing ?? false} onRefresh={onRefresh} tintColor={palette.accent} /> : undefined}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.muted}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  small = false,
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  small?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const styles = useStyles();
  const variantStyle =
    variant === "primary" ? styles.buttonPrimary : variant === "secondary" ? styles.buttonSecondary : variant === "danger" ? styles.buttonDanger : styles.buttonGhost;
  const textStyle = variant === "primary" ? styles.buttonTextPrimary : variant === "danger" ? styles.buttonTextDanger : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={small ? 6 : 0}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, variantStyle, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 }]}
    >
      <Text style={[styles.buttonText, textStyle, small && styles.buttonTextSmall]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  dotColor,
  count,
  disabled = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  dotColor?: string;
  count?: number;
  disabled?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected, disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && { opacity: 0.45 }]}
    >
      {dotColor ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
      {count !== undefined ? <Text style={[styles.chipCount, selected && styles.chipTextSelected]}>{count}</Text> : null}
    </Pressable>
  );
}

/** A horizontally scrolling row of chips, so long lists never wrap into the layout. */
export function ChipRow({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Solid badge in `color`, or `soft` on the accent-soft surface with `color` text. */
export function Badge({ label, color, soft }: { label: string; color?: string; soft?: boolean }) {
  const styles = useStyles();
  const palette = usePalette();
  const tone = color ?? palette.accent;
  return (
    <View style={[styles.badge, { backgroundColor: soft ? palette.accentSoft : tone }]}>
      <Text style={[styles.badgeText, { color: soft ? (color ?? palette.text) : "#ffffff" }]}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ rate }: { rate: number | null }) {
  const styles = useStyles();
  const percent = Math.round((rate ?? 0) * 100);
  return (
    <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={[styles.progressFill, { width: `${percent}%` }]} />
    </View>
  );
}

export function LoadingState({ label = "불러오는 중…" }: { label?: string }) {
  const styles = useStyles();
  const palette = usePalette();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={palette.accent} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const styles = useStyles();
  return (
    <View style={[styles.notice, styles.noticeDanger]} accessibilityRole="alert">
      <Text style={styles.noticeDangerText}>{describeError(error)}</Text>
      {onRetry ? <Button label="다시 시도" variant="secondary" small onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.state}>
      <Text style={[styles.muted, styles.center]}>{children}</Text>
    </View>
  );
}

export function Notice({ children, tone = "info", action }: { children: ReactNode; tone?: "info" | "success" | "warning"; action?: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.notice, tone === "success" ? styles.noticeSuccess : tone === "warning" ? styles.noticeWarning : styles.noticeInfo]}>
      <Text style={styles.body}>{children}</Text>
      {action}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  const styles = useStyles();
  return <Text style={styles.fieldLabel}>{children}</Text>;
}

export function TextField({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const styles = useStyles();
  const { scheme, palette } = useAppTheme();
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        keyboardAppearance={scheme}
        {...props}
        style={[styles.input, props.multiline && styles.inputMultiline, props.style]}
      />
      {hint ? <Text style={styles.muted}>{hint}</Text> : null}
    </View>
  );
}

export function SwitchRow({ label, value, onValueChange, hint }: { label: string; value: boolean; onValueChange: (value: boolean) => void; hint?: string }) {
  const styles = useStyles();
  const palette = usePalette();
  return (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <Text style={styles.body}>{label}</Text>
        {hint ? <Text style={styles.muted}>{hint}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} trackColor={{ true: palette.accent, false: palette.border }} thumbColor="#ffffff" />
    </View>
  );
}

/** A tappable list row with at least the minimum touch height. */
export function ListRow({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  if (!onPress) return <View style={[styles.listRow, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, style, pressed && styles.listRowPressed]}
    >
      {children}
    </Pressable>
  );
}

export function Checkbox({ checked, onPress, label, busy }: { checked: boolean; onPress: () => void; label: string; busy?: boolean }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, busy }}
      accessibilityLabel={label}
      onPress={onPress}
      disabled={busy}
      hitSlop={8}
      style={[styles.checkbox, checked && styles.checkboxChecked]}
    >
      {checked ? <Text style={styles.checkboxMark}>✓</Text> : null}
    </Pressable>
  );
}

/** A small segmented control for 2–4 mutually exclusive options. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange: (value: T) => void; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text styles that follow the current theme. */
export const useTextStyles = makeStyles((c) => ({
  title: { fontSize: fontSize.title, fontWeight: "700", color: c.text },
  heading: { fontSize: fontSize.heading, fontWeight: "800", color: c.text },
  body: { fontSize: fontSize.body, color: c.text, lineHeight: 21 },
  strong: { fontSize: fontSize.body, fontWeight: "700", color: c.text },
  muted: { fontSize: fontSize.caption + 1, color: c.textSecondary, lineHeight: 18 },
  danger: { fontSize: fontSize.caption + 1, color: c.danger },
  accent: { fontSize: fontSize.caption + 1, color: c.accent, fontWeight: "700" },
}));

export const layout = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  spaceBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  stack: { gap: spacing.sm },
  flex: { flex: 1, minWidth: 0 },
});

const useStyles = makeStyles((c) => ({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: c.background },
  screenContent: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl * 2 },
  card: { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.sm },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.title, fontWeight: "700", color: c.text },
  body: { fontSize: fontSize.body, color: c.text, lineHeight: 21 },
  muted: { fontSize: fontSize.caption + 1, color: c.textSecondary, lineHeight: 18 },
  center: { textAlign: "center" },
  button: { minHeight: TOUCH_TARGET, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  buttonSmall: { minHeight: 34, paddingHorizontal: spacing.md },
  buttonPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  buttonSecondary: { backgroundColor: c.surface, borderColor: c.border },
  buttonGhost: { backgroundColor: "transparent", borderColor: "transparent" },
  buttonDanger: { backgroundColor: c.surface, borderColor: c.dangerSoft },
  buttonText: { fontSize: fontSize.body, fontWeight: "700", color: c.text },
  buttonTextPrimary: { color: c.onAccent },
  buttonTextDanger: { color: c.danger },
  buttonTextSmall: { fontSize: fontSize.caption + 1 },
  chip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface },
  chipSelected: { backgroundColor: c.text, borderColor: c.text },
  chipText: { fontSize: fontSize.caption + 1, color: c.text },
  chipTextSelected: { color: c.background, fontWeight: "700" },
  chipCount: { fontSize: fontSize.caption - 1, color: c.textSecondary },
  chipRow: { gap: spacing.sm, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontSize: fontSize.caption - 1, fontWeight: "800" },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: c.accentSoft, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4, backgroundColor: c.accent },
  state: { paddingVertical: spacing.lg, alignItems: "center", gap: spacing.sm },
  notice: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1 },
  noticeInfo: { backgroundColor: c.surfaceMuted, borderColor: c.border },
  noticeSuccess: { backgroundColor: c.successSoft, borderColor: c.border },
  noticeWarning: { backgroundColor: c.accentSoft, borderColor: c.border },
  noticeDanger: { backgroundColor: c.dangerSoft, borderColor: c.border },
  noticeDangerText: { fontSize: fontSize.caption + 1, color: c.danger, lineHeight: 18 },
  field: { gap: 6 },
  fieldLabel: { fontSize: fontSize.caption, fontWeight: "700", color: c.textSecondary },
  input: { minHeight: TOUCH_TARGET, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: c.surfaceElevated, fontSize: fontSize.body, color: c.text },
  inputMultiline: { minHeight: 88, paddingTop: spacing.md, textAlignVertical: "top" },
  switchRow: { minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: spacing.md },
  listRow: { minHeight: TOUCH_TARGET + 12, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.md },
  listRowPressed: { backgroundColor: c.surfaceMuted },
  checkbox: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: c.accent2, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  checkboxChecked: { backgroundColor: c.accent, borderColor: c.accent },
  checkboxMark: { color: c.onAccent, fontWeight: "900", fontSize: 16 },
  segmented: { flexDirection: "row", borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm },
  segmentSelected: { backgroundColor: c.accent },
  segmentText: { fontSize: fontSize.caption + 1, color: c.text },
  segmentTextSelected: { color: c.onAccent, fontWeight: "700" },
}));