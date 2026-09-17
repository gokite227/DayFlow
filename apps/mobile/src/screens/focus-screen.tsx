import type { DayResponse } from "@dayflow/api-client";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useDays, useUpdateDay } from "@/features/days/day-queries";
import { selectionSummary } from "@/features/focus/app-selection";
import type { FocusScheduleState } from "@/features/focus/blocking-adapter";
import { scheduledFocusPrompt } from "@/features/focus/focus-automation";
import {
  PERMISSION_LABEL,
  focusDayCandidates,
  formatClockTime,
  formatCountdown,
  formatKoreanClockTime,
  formatTimeRange,
  parseCustomMinutes,
  runningPermissionNotice,
  runningTitle,
  sessionSummary,
  strictConfirmation,
} from "@/features/focus/focus-display";
import {
  FOCUS_DURATION_PRESETS,
  FOCUS_LOCK_MODES,
  canStopFocus,
  focusDurationProblem,
  needsEndPrompt,
  remainingSeconds,
  type FocusLockMode,
  type FocusSession,
} from "@/features/focus/focus-model";
import { LOCK_MODE_HINT, LOCK_MODE_LABEL } from "@/features/focus/focus-preferences";
import { useFocus } from "@/features/focus/focus-provider";
import { useToday } from "@/lib/use-today";
import { Badge, Button, Card, Chip, ChipRow, FieldLabel, layout, LoadingState, Notice, RadioRow, Screen, SectionHeader, TextField, useTextStyles } from "@/ui/components";
import { usePalette } from "@/ui/theme";

type DurationChoice = `${(typeof FOCUS_DURATION_PRESETS)[number]}` | "custom";

/**
 * Focus: choose a Day (optional), a duration, the apps to block and the lock mode, then run a timer while those
 * apps are blocked (Android). One Focus at a time; after it ends, a linked Day can be marked done. A Day schedule
 * set to "시작 여부 묻기" also shows its question here while it runs.
 */
export default function FocusScreen() {
  const { ready, state, refresh, schedules } = useFocus();
  const { dayId } = useLocalSearchParams<{ dayId?: string }>();
  const [now, setNow] = useState(() => Date.now());

  // Coming back to the screen (e.g. from the Accessibility settings or a notification) re-reads native state.
  useFocusEffect(
    useCallback(() => {
      refresh();
      setNow(Date.now());
    }, [refresh]),
  );
  // The schedule list changes when a schedule starts or is answered: re-evaluate the prompt against the clock.
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(timer);
  }, [schedules]);

  if (!ready) {
    return (
      <Screen>
        <LoadingState label="집중 상태를 확인하는 중…" />
      </Screen>
    );
  }
  const current = state.current;
  const prompt = scheduledFocusPrompt(schedules, state, now);
  return (
    <Screen onRefresh={refresh} refreshing={false}>
      {current?.status === "ACTIVE" ? (
        <RunningFocus session={current} requestedDayId={dayId ?? null} />
      ) : (
        <>
          {prompt ? <ScheduledPromptCard schedule={prompt} /> : null}
          {needsEndPrompt(current) ? <FocusEndCard session={current} /> : null}
          <FocusSetup key={dayId ?? "none"} requestedDayId={dayId ?? null} />
        </>
      )}
    </Screen>
  );
}

function FocusSetup({ requestedDayId }: { requestedDayId: string | null }) {
  const text = useTextStyles();
  const palette = usePalette();
  const router = useRouter();
  const today = useToday();
  const { start, selection, adapter, permission, refresh, settings } = useFocus();
  const daysQuery = useDays();
  const [dayId, setDayId] = useState<string | null>(requestedDayId);
  const [choice, setChoice] = useState<DurationChoice>("25");
  const [customText, setCustomText] = useState("");
  const [lockMode, setLockMode] = useState<FocusLockMode>(settings.lockMode);
  const [message, setMessage] = useState<string | null>(null);

  const candidates = focusDayCandidates(daysQuery.data ?? [], today, requestedDayId);
  const day = candidates.find((candidate) => candidate.id === dayId) ?? null;
  const custom = parseCustomMinutes(customText);
  const minutes = choice === "custom" ? (custom.ok ? custom.minutes : Number.NaN) : Number(choice);
  const durationProblem = choice === "custom" && !custom.ok ? "집중 시간을 분 단위 숫자로 입력해주세요." : focusDurationProblem(minutes);
  const apps = adapter.available ? selection.apps : [];
  const needsPermission = apps.length > 0 && permission.state === "required";

  const begin = () => {
    setMessage(null);
    const result = start({ day: day ? { id: day.id, title: day.title } : null, durationMinutes: minutes, apps, lockMode });
    if (result.ok) return;
    switch (result.reason) {
      case "active":
        setMessage("이미 진행 중인 집중이 있어요.");
        break;
      case "invalid-duration":
      case "native-error":
        setMessage(result.message);
        break;
      case "permission-required":
        setMessage("앱 차단을 사용하려면 Android 접근성 권한이 필요해요. 권한을 켜거나 차단할 앱 선택을 비워주세요.");
        break;
    }
  };

  const onStart = () => {
    if (lockMode !== "STRICT") {
      begin();
      return;
    }
    const confirmation = strictConfirmation(minutes);
    Alert.alert(confirmation.title, confirmation.message, [
      { text: "취소", style: "cancel" },
      { text: confirmation.confirm, style: "destructive", onPress: begin },
    ]);
  };

  return (
    <>
      <Card>
        <SectionHeader title="연결된 Day" subtitle="선택하지 않아도 집중할 수 있어요" />
        <ChipRow>
          <Chip label="선택 안 함" selected={day === null} onPress={() => setDayId(null)} />
          {candidates.map((candidate) => (
            <Chip key={candidate.id} label={candidate.title} selected={candidate.id === dayId} onPress={() => setDayId(candidate.id)} />
          ))}
        </ChipRow>
        {candidates.length === 0 && !daysQuery.isPending ? <Text style={text.muted}>오늘 남은 Day가 없어요.</Text> : null}
      </Card>

      <Card>
        <SectionHeader title="집중 시간" />
        <ChipRow>
          {FOCUS_DURATION_PRESETS.map((preset) => (
            <Chip key={preset} label={`${preset}분`} selected={choice === `${preset}`} onPress={() => setChoice(`${preset}`)} />
          ))}
          <Chip label="직접 설정" selected={choice === "custom"} onPress={() => setChoice("custom")} />
        </ChipRow>
        {choice === "custom" ? <TextField label="분" keyboardType="number-pad" value={customText} onChangeText={setCustomText} placeholder="예: 40" maxLength={3} /> : null}
        {durationProblem ? <Text style={text.danger}>{durationProblem}</Text> : null}
      </Card>

      <Card>
        <SectionHeader
          title="차단 앱"
          subtitle={adapter.available ? selectionSummary(apps) : "이 기기에서는 앱 차단을 아직 쓸 수 없어요. 집중 타이머는 그대로 쓸 수 있어요."}
          action={adapter.available ? <Button label="변경" small variant="secondary" onPress={() => router.push("/focus/apps")} /> : undefined}
        />
        {adapter.available && apps.length > 0 ? (
          <>
            <View style={layout.rowWrap}>
              <Badge label={`앱 차단 ${PERMISSION_LABEL[permission.state]}`} color={permission.state === "granted" ? palette.success : palette.accent} />
            </View>
            {permission.state === "granted" ? null : (
              <>
                <Text style={text.body}>앱 차단을 사용하려면 Android 접근성 권한이 필요해요.</Text>
                <Text style={text.muted}>집중 시간 동안 선택한 앱이 열렸는지만 확인해 차단 화면을 표시합니다. 화면 내용은 읽지 않아요.</Text>
                <Text style={text.muted}>접근성 설정에서 &apos;DayFlow 집중 모드&apos; 스위치만 켜면 돼요. 바로가기(접근성 버튼)는 켜지 않아도 돼요.</Text>
                <View style={layout.rowWrap}>
                  <Button label="접근성 설정 열기" small variant="secondary" onPress={() => void adapter.openPermissionSettings().then(refresh)} />
                  <Button label="다시 확인" small variant="ghost" onPress={refresh} />
                </View>
              </>
            )}
          </>
        ) : adapter.available ? (
          <Text style={text.muted}>차단 앱 없이 타이머만 사용해요. 접근성 권한은 필요 없어요.</Text>
        ) : null}
      </Card>

      <Card>
        <SectionHeader title="잠금 방식" />
        {FOCUS_LOCK_MODES.map((mode) => (
          <RadioRow key={mode} label={LOCK_MODE_LABEL[mode]} hint={LOCK_MODE_HINT[mode]} selected={lockMode === mode} onPress={() => setLockMode(mode)} />
        ))}
      </Card>

      {message ? <Notice tone="warning">{message}</Notice> : null}
      <Button label="집중 시작" disabled={durationProblem !== null || needsPermission} onPress={onStart} />
      {needsPermission ? <Text style={text.muted}>접근성 권한을 켜거나 차단 앱을 비우면 시작할 수 있어요.</Text> : null}
    </>
  );
}

/** "수학 공부를 시작할까요?" for a running ASK schedule; the same native path as the notification buttons. */
function ScheduledPromptCard({ schedule }: { schedule: FocusScheduleState }) {
  const text = useTextStyles();
  const { acceptSchedule, dismissSchedule, permission } = useFocus();
  const [message, setMessage] = useState<string | null>(null);
  const strict = schedule.lockMode === "STRICT";

  const accept = () => {
    const result = acceptSchedule(schedule.id);
    if (result.error) setMessage(result.error);
  };
  const onAccept = () => {
    if (!strict) {
      accept();
      return;
    }
    const confirmation = strictConfirmation(Math.max(Math.ceil((schedule.endAt - Date.now()) / 60_000), 1), schedule.endAt);
    Alert.alert(confirmation.title, confirmation.message, [
      { text: "취소", style: "cancel" },
      { text: confirmation.confirm, style: "destructive", onPress: accept },
    ]);
  };

  return (
    <Card>
      <SectionHeader title={`${schedule.title}을(를) 시작할까요?`} subtitle={formatTimeRange(schedule.startAt, schedule.endAt)} />
      <Text style={text.muted}>
        {schedule.appIds.length > 0 ? `앱 ${schedule.appIds.length}개 차단` : "차단 앱 없음"} · {LOCK_MODE_LABEL[schedule.lockMode]}
      </Text>
      {schedule.appIds.length > 0 && permission.state === "required" ? (
        <Text style={text.muted}>접근성 권한이 꺼져 있어 지금은 앱이 차단되지 않아요. 타이머는 일정이 끝날 때까지 이어져요.</Text>
      ) : null}
      {message ? <Notice tone="warning">{message}</Notice> : null}
      <View style={layout.rowWrap}>
        <Button label="집중 시작" small onPress={onAccept} />
        <Button label="나중에" small variant="secondary" onPress={() => dismissSchedule(schedule.id)} />
      </View>
    </Card>
  );
}

function RunningFocus({ session, requestedDayId }: { session: FocusSession; requestedDayId: string | null }) {
  const text = useTextStyles();
  const { stop, refresh, permission } = useFocus();
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const seconds = remainingSeconds(session, now);
  const strict = session.lockMode === "STRICT";

  const tick = useCallback(() => setNow(Date.now()), []);
  useEffect(() => {
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [tick]);
  // Time is up on screen: let the provider mark the session COMPLETED (native expires on its own).
  useEffect(() => {
    if (seconds === 0) refresh();
  }, [seconds, refresh]);

  const confirmStop = () =>
    Alert.alert("집중을 종료할까요?", "차단된 앱도 바로 다시 쓸 수 있어요.", [
      { text: "계속 집중", style: "cancel" },
      {
        text: "종료",
        style: "destructive",
        onPress: () => {
          const result = stop();
          if (result.locked) setMessage("종료 시각까지 해제할 수 없는 집중이에요.");
          else if (result.nativeError) setMessage(`앱 차단을 해제하지 못했어요: ${result.nativeError}`);
        },
      },
    ]);

  const permissionNotice = runningPermissionNotice(session, permission);
  const otherDayRequested = requestedDayId !== null && requestedDayId !== session.dayId;

  return (
    <>
      {otherDayRequested ? <Notice tone="warning">이미 진행 중인 집중이 있어요. 지금 집중을 마친 뒤 다른 Day를 시작할 수 있어요.</Notice> : null}
      <Card>
        <SectionHeader title={runningTitle(session)} subtitle={session.dayTitle || "Day 없이 집중"} />
        <Text style={[text.title, { fontSize: 48, textAlign: "center", fontVariant: ["tabular-nums"] }]} accessibilityLabel={`남은 시간 ${formatCountdown(seconds)}`}>
          {formatCountdown(seconds)}
        </Text>
        <Text style={[text.body, { textAlign: "center" }]}>남음</Text>
        {strict ? (
          <Text style={[text.strong, { textAlign: "center" }]}>{formatKoreanClockTime(session.endsAt)}에 자동으로 해제돼요.</Text>
        ) : (
          <Text style={[text.muted, { textAlign: "center" }]}>
            {formatClockTime(session.startedAt)} 시작 · {formatClockTime(session.endsAt)} 종료 예정
          </Text>
        )}
        <Text style={[text.muted, { textAlign: "center" }]}>
          {session.blockedApps.length > 0 ? `차단 중인 앱 ${session.blockedApps.length}개` : "차단 앱 없음 · 타이머만 사용 중"}
        </Text>
      </Card>
      {permissionNotice ? <Notice tone="warning">{permissionNotice}</Notice> : null}
      {message ? <Notice tone="warning">{message}</Notice> : null}
      {canStopFocus(session, now) ? <Button label="집중 종료" variant="danger" onPress={confirmStop} /> : null}
      {strict ? <Text style={[text.muted, { textAlign: "center" }]}>종료 시각 전에는 집중 시간, 차단 앱, 잠금 방식을 바꿀 수 없어요.</Text> : null}
    </>
  );
}

/** After a Focus: "이 Day를 완료했나요?" (linked Day) or a short summary. Never creates a Review. */
function FocusEndCard({ session }: { session: FocusSession }) {
  const text = useTextStyles();
  const { acknowledgeEnd } = useFocus();
  const daysQuery = useDays();
  const updateDay = useUpdateDay();
  const day: DayResponse | undefined = session.dayId ? daysQuery.data?.find((candidate) => candidate.id === session.dayId) : undefined;
  const title = session.status === "COMPLETED" ? "집중을 마쳤어요" : "집중을 종료했어요";

  if (session.dayId === null) {
    return (
      <Card>
        <SectionHeader title={title} subtitle={sessionSummary(session)} />
        <Button label="확인" small variant="secondary" onPress={() => acknowledgeEnd(null)} />
      </Card>
    );
  }

  const markDone = () => {
    // The Day was deleted (or is not loaded): the answer is still recorded; nothing to update.
    if (!day) {
      acknowledgeEnd("DONE");
      return;
    }
    // Same PATCH as the Day checkbox (status + version only), so date and schedule stay as they are.
    updateDay.mutate({ dayId: day.id, body: { status: "DONE", version: day.version } }, { onSuccess: () => acknowledgeEnd("DONE") });
  };

  return (
    <Card>
      <SectionHeader title={title} subtitle={sessionSummary(session)} />
      <Text style={text.body}>&apos;{day?.title ?? session.dayTitle}&apos; Day를 완료했나요?</Text>
      {updateDay.error ? <Text style={text.danger}>Day를 완료로 바꾸지 못했어요. 다시 시도해주세요.</Text> : null}
      <View style={layout.rowWrap}>
        <Button label={updateDay.isPending ? "저장 중…" : "완료"} small disabled={updateDay.isPending} onPress={markDone} />
        <Button label="아직 진행 중" small variant="secondary" disabled={updateDay.isPending} onPress={() => acknowledgeEnd("IN_PROGRESS")} />
      </View>
      {day?.status === "DONE" ? <FieldLabel>이미 완료된 Day예요.</FieldLabel> : null}
    </Card>
  );
}
