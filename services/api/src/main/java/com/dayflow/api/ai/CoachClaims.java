package com.dayflow.api.ai;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Checks of what a Coach sentence may claim, shared by the Coaches that cite backend evidence (Review, Recovery,
 * Planning). All checks run on the model's own words: callers blank out the user's titles first
 * ({@link CoachText#withoutTitles}).
 */
public final class CoachClaims {

    /**
     * Causes DayFlow has no data for (willpower, motivation, fatigue, focus, health, personality, dislike), vague
     * effort advice, and causal wording: the records show what happened together, not why.
     */
    public static final Pattern UNSUPPORTED_CAUSE = Pattern.compile(
            "의지|의욕|동기\\s*부여|동기가|게으|나태|피곤|피로|지쳐|지친|지치|스트레스|번아웃|우울|불안|무기력"
                    + "|집중력|자기\\s*통제|자제력|성격|싫어하|싫어서|귀찮|컨디션|건강|수면|잠이\\s*부족|체력"
                    + "|노력이\\s*부족|더\\s*열심히|열심히\\s*하|최선을\\s*다"
                    + "|때문|(으)?로\\s*인(한|해)|탓"
                    // An asserted cause ("주요 원인으로 보여요"), not "원인은 기록만으로 알기 어려워요".
                    + "|주요\\s*원인|원인(으로|이에요|이다|입니다|일\\s*(수|가능성)|인\\s*것)");

    /** Difficulty or effort guessed from a title (no data for it). */
    public static final Pattern SUBJECTIVE_DIFFICULTY = Pattern.compile(
            "쉬운|쉬워|쉽게\\s*(시작|끝|할|해)|간단한\\s*(일|Day|작업|것)|가장\\s*간단|간단해\\s*보"
                    + "|부담(이|가)?\\s*(적|덜|없|작|크지)|금방\\s*(끝|할|해|마칠|마무리)"
                    + "|가볍게\\s*(시작|끝|할|해)|가벼운\\s*(일|Day|작업|것)|빨리\\s*끝낼\\s*수|손쉽");

    /** How much time a user has on a day: DayFlow has no availability setting, so this is never claimed. */
    public static final Pattern AVAILABILITY_GUESS = Pattern.compile(
            "여유|시간이\\s*(많|충분|넉넉|없)|바쁘|한가|하루\\s*\\d+\\s*시간\\s*(가능|쓸\\s*수)");

    public static final Pattern TIME_WORDS = Pattern.compile("오전|오후|저녁|밤|새벽|아침|심야|점심");
    public static final Pattern WEEKDAY_WORDS = Pattern.compile("[월화수목금토일]요일|주말|평일");
    private static final Pattern WEEKDAY_MENTION = Pattern.compile("([월화수목금토일])요일");
    /** The weekday DayFlow writes after a date in its labels: "9월 19일(토)". */
    private static final Pattern LABEL_WEEKDAY = Pattern.compile("\\(([월화수목금토일])\\)");
    private static final String WEEKDAYS = "월화수목금토일";
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");
    /** "8시", "20시 이후": clock times, not counts ("3시간" is a duration and is checked). */
    private static final Pattern CLOCK = Pattern.compile("\\d{1,2}\\s*시(?!간)");

    private CoachClaims() {
    }

    /** An evidence key as the model may write it ("load_2026-09-19") in DayFlow's form ("LOAD_2026_09_19"). */
    public static String normalizeKey(String key) {
        return key.strip().replace('-', '_').toUpperCase(Locale.ROOT);
    }

    /**
     * The reason shown when the model's action is valid but its wording is not: DayFlow's own evidence labels. The
     * applicable action is kept, and nothing the model guessed reaches the user.
     */
    public static String reasonFromEvidence(List<CoachFact> evidence, int max) {
        return CoachText.clip(String.join(" · ", evidence.stream().map(CoachFact::label).toList()), max);
    }

    /** Korean weekday of a date: 2026-09-19 → "토". */
    public static String weekdayOf(LocalDate date) {
        return String.valueOf(WEEKDAYS.charAt(date.getDayOfWeek().getValue() - 1));
    }

    /** The weekdays of cited facts ("(토)" in a label) plus the given dates. */
    public static Set<String> weekdays(Collection<CoachFact> facts, Collection<LocalDate> dates) {
        Set<String> weekdays = new HashSet<>();
        for (CoachFact fact : facts) {
            Matcher matcher = LABEL_WEEKDAY.matcher(fact.label());
            while (matcher.find()) {
                weekdays.add(matcher.group(1));
            }
        }
        dates.forEach(date -> weekdays.add(weekdayOf(date)));
        return weekdays;
    }

    /**
     * Whether every "X요일" in {@code own} is a weekday DayFlow backs for this sentence (the cited facts or the date of
     * the change). A model that calls Saturday 9/19 "금요일" is caught here.
     */
    public static boolean weekdaysAllowed(String own, Set<String> allowed) {
        Matcher matcher = WEEKDAY_MENTION.matcher(own);
        while (matcher.find()) {
            if (!allowed.contains(matcher.group(1))) {
                return false;
            }
        }
        return true;
    }

    /** Every number that appears in the given labels (evidence the backend computed). */
    public static Set<String> numbersIn(Collection<String> labels) {
        Set<String> numbers = new HashSet<>();
        for (String label : labels) {
            Matcher matcher = NUMBER.matcher(label);
            while (matcher.find()) {
                numbers.add(matcher.group());
            }
        }
        return numbers;
    }

    public static void addDate(Set<String> numbers, LocalDate date) {
        numbers.add(String.valueOf(date.getYear()));
        numbers.add(String.valueOf(date.getMonthValue()));
        numbers.add(String.valueOf(date.getDayOfMonth()));
    }

    /** Whether every number of {@code own} (clock times aside) is one of {@code allowed}. */
    public static boolean numbersAllowed(String own, Set<String> allowed) {
        Matcher numbers = NUMBER.matcher(CLOCK.matcher(own).replaceAll(" "));
        while (numbers.find()) {
            if (!allowed.contains(numbers.group())) {
                return false;
            }
        }
        return true;
    }
}
