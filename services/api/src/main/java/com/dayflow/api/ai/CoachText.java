package com.dayflow.api.ai;

import java.util.Collection;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * User-facing text rules shared by every Coach. The model talks to DayFlow in internal refs ("D1", "G1", "R1"),
 * evidence/metric keys and English enums; the user must only ever see titles, labels and Korean words.
 *
 * <p>Only refs and keys of the current request are replaced, so ordinary text such as "DDR4" or an unknown "D99"
 * stays as it is. Words inside the user's own titles are never rewritten.
 */
public final class CoachText {

    /** Planning enums as the apps show them. Coaches may add their own words on top. */
    public static final Map<String, String> PLANNING_ENUM_WORDS = Map.ofEntries(
            Map.entry("HIGH", "높음"), Map.entry("MEDIUM", "보통"), Map.entry("NORMAL", "보통"), Map.entry("LOW", "낮음"),
            Map.entry("NONE", "없음"), Map.entry("NOT_STARTED", "진행 전"), Map.entry("IN_PROGRESS", "진행 중"),
            Map.entry("DONE", "완료"), Map.entry("DEFERRED", "미룸"), Map.entry("SKIPPED", "건너뜀"),
            Map.entry("RESCHEDULE_DAY", "날짜 이동"), Map.entry("SET_PRIORITY", "우선순위 변경"),
            Map.entry("OPEN_DAY", "Day 열기"), Map.entry("ADVICE_ONLY", "조언"));

    private static final Pattern REF = Pattern.compile(
            "[(\\[]\\s*([DGR]\\d{1,3})\\s*[)\\]]|['\"‘“]?(?<![A-Za-z0-9_])([DGR]\\d{1,3})(?![A-Za-z0-9_])['\"’”]?");
    private static final Pattern WORD = Pattern.compile("(?<![A-Za-z0-9_])([A-Za-z][A-Za-z0-9_]*)(?![A-Za-z0-9_])");

    /**
     * What a request knows.
     *
     * @param refNames  internal ref → the title or label to show ("D1" → "보고서 초안")
     * @param keyLabels metric/evidence key → label ("overbookedMinutes" → "겹쳐서 넘치는 시간 1시간")
     * @param titles    the user's own titles (never rewritten)
     * @param enumWords English enum → Korean word
     */
    public record Vocabulary(Map<String, String> refNames, Map<String, String> keyLabels, Collection<String> titles,
            Map<String, String> enumWords) {
    }

    private CoachText() {
    }

    /** One line, control characters removed, at most {@code max} characters. */
    public static String clip(String text, int max) {
        if (text == null) {
            return "";
        }
        String clean = text.replaceAll("\\p{Cntrl}+", " ").strip();
        return clean.length() <= max ? clean : clean.substring(0, max - 1) + "…";
    }

    public static String userFacing(String text, Vocabulary vocabulary) {
        // 1) English enums and keys first, so titles inserted in step 2 are never rewritten.
        boolean[] inTitle = titleSpans(text, vocabulary.titles());
        Matcher words = WORD.matcher(text);
        StringBuilder replaced = new StringBuilder();
        while (words.find()) {
            String word = words.group(1);
            String replacement = inTitle[words.start()] ? null : vocabulary.enumWords().get(word);
            if (replacement == null && !inTitle[words.start()] && vocabulary.keyLabels().containsKey(word)) {
                replacement = vocabulary.keyLabels().get(word);
            }
            words.appendReplacement(replaced, Matcher.quoteReplacement(replacement == null ? word : replacement));
        }
        words.appendTail(replaced);
        String withoutEnums = replaced.toString().replaceAll("(높음|낮음|없음|보통)로", "$1으로");

        // 2) Internal refs of this request only.
        Matcher refs = REF.matcher(withoutEnums);
        StringBuilder out = new StringBuilder();
        while (refs.find()) {
            boolean parenthesized = refs.group(1) != null;
            String ref = parenthesized ? refs.group(1) : refs.group(2);
            String name = vocabulary.refNames().get(ref);
            String replacement;
            if (name == null) {
                replacement = refs.group();
            } else if (parenthesized) {
                // "보고서 초안(D1)": the title is usually already written next to it.
                replacement = withoutEnums.contains(name) ? "" : "('" + name + "')";
            } else {
                replacement = "'" + name + "'";
            }
            refs.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        refs.appendTail(out);

        return out.toString()
                .replaceAll("\\s{2,}", " ")
                .replaceAll("\\s+([.,!?)])", "$1")
                .strip();
    }

    /** The text with the user's own titles blanked out, for checks that must judge only the model's words. */
    public static String withoutTitles(String text, Collection<String> titles) {
        boolean[] inTitle = titleSpans(text, titles);
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            out.append(inTitle[i] ? ' ' : text.charAt(i));
        }
        return out.toString();
    }

    private static boolean[] titleSpans(String text, Collection<String> titles) {
        boolean[] marked = new boolean[text.length() + 1];
        for (String title : titles) {
            if (title == null || title.isBlank()) {
                continue;
            }
            for (int at = text.indexOf(title); at >= 0; at = text.indexOf(title, at + 1)) {
                for (int i = at; i < at + title.length(); i++) {
                    marked[i] = true;
                }
            }
        }
        return marked;
    }
}
