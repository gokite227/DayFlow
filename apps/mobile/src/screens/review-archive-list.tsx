import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  ARCHIVE_TYPE_FILTERS,
  ARCHIVE_TYPE_LABEL,
  archiveCardCounts,
  archiveCardTitle,
  archiveEmptyMessage,
  ratingLabel,
  reviewDetailRoute,
  type ArchiveTypeFilter,
} from "@/features/review/review-archive";
import { useReviewArchive } from "@/features/review/review-queries";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, ErrorState, layout, ListRow, LoadingState, useTextStyles } from "@/ui/components";
import { fontSize, radius, spacing, TOUCH_TARGET, usePalette } from "@/ui/theme";

/**
 * 회고 모아보기: saved reviews newest period first, filtered and searched on the server, "더 보기" for the next
 * page. A card pushes /review/detail, so Back returns here with the same filter and search.
 */
export function ReviewArchiveList() {
  const text = useTextStyles();
  const palette = usePalette();
  const router = useRouter();
  const [type, setType] = useState<ArchiveTypeFilter>("ALL");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const archive = useReviewArchive({ type, q });
  const entries = archive.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <ChipRow>
        {ARCHIVE_TYPE_FILTERS.map((value) => (
          <Chip key={value} label={ARCHIVE_TYPE_LABEL[value]} selected={type === value} onPress={() => setType(value)} />
        ))}
      </ChipRow>
      <View style={[layout.row, { gap: spacing.sm }]}>
        <TextInput
          accessibilityLabel="회고 검색"
          placeholder="KPT 내용이나 목표 이름으로 검색"
          placeholderTextColor={palette.textSecondary}
          value={draft}
          maxLength={100}
          returnKeyType="search"
          onChangeText={setDraft}
          onSubmitEditing={() => setQ(draft.trim())}
          style={{
            flex: 1,
            minHeight: TOUCH_TARGET,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: radius.md,
            paddingHorizontal: spacing.md,
            backgroundColor: palette.surface,
            fontSize: fontSize.body,
            color: palette.text,
          }}
        />
        <Button label="검색" small onPress={() => setQ(draft.trim())} />
      </View>
      {q !== "" ? (
        <Button
          label={`"${q}" 검색 지우기`}
          variant="ghost"
          small
          onPress={() => {
            setDraft("");
            setQ("");
          }}
        />
      ) : null}

      <Card>
        {archive.isPending ? (
          <LoadingState label="회고를 불러오는 중…" />
        ) : archive.isError && entries.length === 0 ? (
          <ErrorState error={archive.error} onRetry={() => void archive.refetch()} />
        ) : entries.length === 0 ? (
          <EmptyState>{archiveEmptyMessage({ type, q })}</EmptyState>
        ) : (
          <>
            {entries.map((entry) => (
              <ListRow key={entry.id} onPress={() => router.push(reviewDetailRoute(entry))} accessibilityLabel={`${archiveCardTitle(entry)} 열기`}>
                <View style={[layout.flex, { gap: 4 }]}>
                  <View style={layout.spaceBetween}>
                    <Text style={[text.strong, layout.flex]} numberOfLines={1}>
                      {archiveCardTitle(entry)}
                    </Text>
                    {entry.completed ? <Badge label="작성 완료" soft /> : null}
                  </View>
                  <Text style={text.muted} numberOfLines={2}>
                    {entry.preview ?? "작성한 KPT가 없어요."}
                  </Text>
                  <Text style={text.muted}>
                    {ratingLabel(entry.rating)} · {archiveCardCounts(entry)}
                  </Text>
                </View>
                <Text style={text.muted}>›</Text>
              </ListRow>
            ))}
            {/* A failed next page keeps the cards already shown. */}
            {archive.isFetchNextPageError ? <ErrorState error={archive.error} onRetry={() => void archive.fetchNextPage()} /> : null}
            {archive.hasNextPage ? (
              <Button
                label={archive.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
                variant="secondary"
                disabled={archive.isFetchingNextPage}
                onPress={() => void archive.fetchNextPage()}
              />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
