import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { Platform, Pressable, Text, View } from "react-native";
import { timeLabel } from "@/features/days/day-schedule-values";
import { koreanShortDate } from "@/lib/dates";
import { FieldLabel } from "./components";
import { TOUCH_TARGET, fontSize, makeStyles, radius, spacing, useAppTheme } from "./theme";

const pad = (value: number) => String(value).padStart(2, "0");

/** "YYYY-MM-DD" ↔ a Date at local noon (noon avoids DST edges when the picker converts). */
function dateFromLocal(value: string): Date {
  const [year = 1970, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function localFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Date input: Android opens the system dialog, iOS shows the compact picker inline.
 * `value` "" means "no date" (only when `onClear` is given).
 */
export function DateField({
  label,
  value,
  onChange,
  onClear,
  min,
  max,
  fallback,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  min?: string;
  max?: string | null;
  /** Date shown in the picker while value is empty. */
  fallback: string;
}) {
  const styles = useStyles();
  const { scheme, palette } = useAppTheme();
  const current = dateFromLocal(value || fallback);
  const minimumDate = min ? dateFromLocal(min) : undefined;
  const maximumDate = max ? dateFromLocal(max) : undefined;

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.row}>
        {Platform.OS === "ios" ? (
          value === "" ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${label} 선택`} style={styles.value} onPress={() => onChange(fallback)}>
              <Text style={styles.placeholder}>날짜 선택</Text>
            </Pressable>
          ) : (
            <DateTimePicker
              value={current}
              mode="date"
              display="compact"
              locale="ko-KR"
              minimumDate={minimumDate}
              maximumDate={maximumDate}
              onValueChange={(_, date) => onChange(localFromDate(date))}
              accentColor={palette.accent}
              themeVariant={scheme}
            />
          )
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} ${value ? koreanShortDate(value) : "선택"}`}
            style={styles.value}
            onPress={() =>
              DateTimePickerAndroid.open({
                value: current,
                mode: "date",
                minimumDate,
                maximumDate,
                onChange: (event, date) => {
                  if (event.type === "set" && date) onChange(localFromDate(date));
                },
              })
            }
          >
            <Text style={value ? styles.valueText : styles.placeholder}>{value ? koreanShortDate(value) : "날짜 선택"}</Text>
          </Pressable>
        )}
        {onClear && value !== "" ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${label} 지우기`} hitSlop={8} onPress={onClear} style={styles.clear}>
            <Text style={styles.placeholder}>지우기</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * "HH:mm" time input with 1-minute precision (no minuteInterval): the detail editors keep any minute such as 20:27.
 * Shows "오후 8:27"; Android opens the system time dialog, iOS the compact inline picker.
 * `value` "24:00" (end of day) is shown as 자정 and opens the picker at 00:00.
 */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const styles = useStyles();
  const { scheme, palette } = useAppTheme();
  const [hour = 9, minute = 0] = value.split(":").map(Number);
  const current = new Date(2000, 0, 1, hour % 24, minute);
  const toValue = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      {Platform.OS === "ios" ? (
        <DateTimePicker
          value={current}
          mode="time"
          display="compact"
          locale="ko-KR"
          minuteInterval={1}
          onValueChange={(_, date) => onChange(toValue(date))}
          accentColor={palette.accent}
          themeVariant={scheme}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${timeLabel(value)}`}
          style={styles.value}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: current,
              mode: "time",
              onChange: (event, date) => {
                if (event.type === "set" && date) onChange(toValue(date));
              },
            })
          }
        >
          <Text style={styles.valueText}>{timeLabel(value)}</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  field: { gap: 6, flex: 1, minWidth: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  value: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: c.surfaceElevated,
    flexShrink: 1,
  },
  valueText: { fontSize: fontSize.body, color: c.text },
  placeholder: { fontSize: fontSize.body, color: c.muted },
  clear: { minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: spacing.sm },
}));
