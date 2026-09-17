import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { categorySelectionLabel, categorySelectionState, groupAppsByCategory, type AppCategoryId } from "@/features/focus/app-categories";
import { searchApps, selectionCounts, selectionForInstalledApps, toggleApp, toggleApps } from "@/features/focus/app-selection";
import type { SelectableApp } from "@/features/focus/blocking-adapter";
import type { BlockedAppRef } from "@/features/focus/focus-model";
import { useFocus } from "@/features/focus/focus-provider";
import { Button, Card, Checkbox, EmptyState, ErrorState, layout, ListRow, LoadingState, Notice, Screen, TextField, useTextStyles } from "@/ui/components";
import { radius } from "@/ui/theme";

/**
 * 차단 앱 선택: a summary, "모든 앱", categories (select all / none, expand to single apps) and a name search.
 * DayFlow, launchers, Settings, System UI and phone apps are never listed (the native module leaves them out).
 * Without `dayId` it edits the default list; with `dayId` the list used only by that Day's schedule.
 */
export default function FocusAppsScreen() {
  const text = useTextStyles();
  const router = useRouter();
  const { dayId } = useLocalSearchParams<{ dayId?: string }>();
  const { adapter, selection, saveSelection, dayPreferences, saveDayPreference, state } = useFocus();
  const [apps, setApps] = useState<SelectableApp[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [selected, setSelected] = useState<BlockedAppRef[] | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<AppCategoryId>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const dayPreference = dayId ? dayPreferences[dayId] : undefined;
  const initialApps = dayPreference?.apps ?? selection.apps;
  const strictRunning = state.current?.status === "ACTIVE" && state.current.lockMode === "STRICT";

  // Loaded when the screen opens (and on retry); the list can take a moment on devices with many apps.
  useEffect(() => {
    let cancelled = false;
    adapter
      .getSelectableApps()
      .then((installed) => {
        if (cancelled) return;
        setApps(installed);
        setSelected((current) => current ?? selectionForInstalledApps({ apps: initialApps }, installed));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason);
      });
    return () => {
      cancelled = true;
    };
    // The saved selection only seeds the first load; later changes come from this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, attempt]);
  const retry = () => {
    setError(null);
    setAttempt((count) => count + 1);
  };

  // iOS: Apple's own picker; the chosen apps stay opaque Screen Time tokens on the device.
  if (adapter.selectionMode === "system-picker" && adapter.presentSystemPicker) {
    const pick = adapter.presentSystemPicker;
    const current = dayPreference?.apps ?? selection.apps;
    return (
      <Screen>
        <Card>
          <Text style={text.title}>차단 앱 선택</Text>
          <Text style={text.strong}>{current.length > 0 ? current.map((app) => app.label).join(", ") : "차단 앱 없음"}</Text>
          <Text style={text.muted}>iPhone의 Screen Time 화면에서 앱과 카테고리를 골라요. 고른 앱의 이름은 DayFlow에 저장되지 않아요.</Text>
        </Card>
        {strictRunning ? <Notice tone="warning">강제 집중 중에는 차단 앱을 바꿀 수 없어요. 집중이 끝난 뒤 다시 시도해주세요.</Notice> : null}
        {error ? <ErrorState error={error} /> : null}
        <Button
          label="Screen Time에서 앱 선택"
          disabled={strictRunning}
          onPress={() =>
            void pick()
              .then((refs) => {
                if (refs === null) return;
                if (dayId) saveDayPreference(dayId, { triggerMode: dayPreference?.triggerMode ?? "DEFAULT", lockMode: dayPreference?.lockMode ?? "DEFAULT", apps: refs });
                else saveSelection(refs);
                router.back();
              })
              .catch(setError)
          }
        />
        <Button label="취소" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (adapter.selectionMode !== "list") {
    return (
      <Screen>
        <EmptyState>이 기기에서는 차단할 앱을 고를 수 없어요.</EmptyState>
      </Screen>
    );
  }
  if (error) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={retry} />
      </Screen>
    );
  }
  if (apps === null || selected === null) {
    return (
      <Screen>
        <LoadingState label="설치된 앱을 불러오는 중…" />
      </Screen>
    );
  }

  const selectedIds = new Set(selected.map((app) => app.id));
  const counts = selectionCounts(selected);
  const searching = query.trim() !== "";
  const results = searching ? searchApps(apps, query) : [];
  const groups = groupAppsByCategory(apps);
  const allState = categorySelectionState(apps, selectedIds);
  const toggleAll = () => setSelected((current) => toggleApps(current ?? [], apps));
  const toggleExpanded = (id: AppCategoryId) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    if (dayId) saveDayPreference(dayId, { triggerMode: dayPreference?.triggerMode ?? "DEFAULT", lockMode: dayPreference?.lockMode ?? "DEFAULT", apps: selected });
    else saveSelection(selected);
    router.back();
  };

  return (
    <Screen>
      <Card>
        <Text style={text.title}>차단 앱 선택</Text>
        <Text style={text.strong}>{counts.apps === 0 ? "차단 앱 없음" : `카테고리 ${counts.categories} · 앱 ${counts.apps}`}</Text>
        <Text style={text.muted}>
          {dayId ? "이 Day의 일정 집중에만 쓰는 목록이에요." : "집중하는 동안 열리지 않게 할 앱이에요."} DayFlow, 설정, 홈 화면, 전화는 항상 쓸 수 있어요.
        </Text>
      </Card>
      {strictRunning ? <Notice tone="warning">강제 집중 중에는 차단 앱을 바꿀 수 없어요. 집중이 끝난 뒤 다시 시도해주세요.</Notice> : null}
      <TextField label="앱 검색" value={query} onChangeText={setQuery} placeholder="앱 이름" autoCapitalize="none" autoCorrect={false} />

      {searching ? (
        <Card>
          {results.length === 0 ? (
            <EmptyState>검색 결과가 없어요.</EmptyState>
          ) : (
            results.map((app) => <AppRow key={app.id} app={app} checked={selectedIds.has(app.id)} onToggle={() => setSelected((current) => toggleApp(current ?? [], app))} />)
          )}
        </Card>
      ) : apps.length === 0 ? (
        <EmptyState>고를 수 있는 앱이 없어요.</EmptyState>
      ) : (
        <Card>
          <ListRow onPress={toggleAll} accessibilityLabel={`모든 앱 ${allState === "ALL" ? "전체 해제" : "전체 선택"}`}>
            <Checkbox checked={allState === "ALL"} mixed={allState === "PARTIAL"} onPress={toggleAll} label={`모든 앱 ${allState === "ALL" ? "전체 해제" : "전체 선택"}`} />
            <View style={layout.flex}>
              <Text style={text.strong}>모든 앱</Text>
              <Text style={text.muted}>차단할 수 있는 앱 {apps.length}개</Text>
            </View>
          </ListRow>
          {groups.map((group) => {
            const open = expanded.has(group.id);
            const groupState = categorySelectionState(group.apps, selectedIds);
            const toggleGroup = () => setSelected((current) => toggleApps(current ?? [], group.apps));
            return (
              <View key={group.id}>
                <ListRow onPress={() => toggleExpanded(group.id)} accessibilityLabel={`${group.label} ${open ? "접기" : "펼치기"}`}>
                  <Checkbox
                    checked={groupState === "ALL"}
                    mixed={groupState === "PARTIAL"}
                    onPress={toggleGroup}
                    label={`${group.label} ${groupState === "ALL" ? "전체 해제" : "전체 선택"}`}
                  />
                  <View style={layout.flex}>
                    <Text style={text.body}>{group.label}</Text>
                    <Text style={text.muted}>{categorySelectionLabel(group.apps, selectedIds)}</Text>
                  </View>
                  <Pressable onPress={() => toggleExpanded(group.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${group.label} ${open ? "접기" : "펼치기"}`}>
                    <Text style={[text.muted, { fontSize: 20 }]}>{open ? "⌄" : "›"}</Text>
                  </Pressable>
                </ListRow>
                {open
                  ? group.apps.map((app) => (
                      <AppRow key={app.id} app={app} indent checked={selectedIds.has(app.id)} onToggle={() => setSelected((current) => toggleApp(current ?? [], app))} />
                    ))
                  : null}
              </View>
            );
          })}
        </Card>
      )}

      <Button label={counts.apps === 0 ? "차단 앱 없이 저장" : `앱 ${counts.apps}개 저장`} disabled={strictRunning} onPress={save} />
      <Button label="취소" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function AppRow({ app, checked, onToggle, indent }: { app: SelectableApp; checked: boolean; onToggle: () => void; indent?: boolean }) {
  const text = useTextStyles();
  return (
    <ListRow onPress={onToggle} accessibilityLabel={`${app.label} ${checked ? "선택 해제" : "선택"}`} style={indent ? { paddingLeft: 36 } : undefined}>
      <Checkbox checked={checked} onPress={onToggle} label={`${app.label} 선택`} />
      {app.iconUri ? (
        <Image source={{ uri: app.iconUri }} style={{ width: 32, height: 32, borderRadius: radius.sm }} accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ width: 32, height: 32 }} />
      )}
      <Text style={[text.body, layout.flex]} numberOfLines={1}>
        {app.label}
      </Text>
    </ListRow>
  );
}
