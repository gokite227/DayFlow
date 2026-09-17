package com.dayflow.api.recovery;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayDtos.UpdateDayRequest;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DaySchedule;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayService;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryRequest;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryCandidateReason;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryCandidateResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDayResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDecisionRequest;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryEventItemResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryEventResponse;
import com.dayflow.api.recovery.RecoveryDtos.SaveRecoveryDayRequest;
import com.dayflow.api.recovery.RecoveryDtos.VersionedIdRequest;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * REC-001 recovery plans, REC-002 recovery days and REC-005 history/re-surfacing. Day changes go through
 * DayService, so the same rules as PATCH /days apply (versions, WEEK/PERIOD Goal period, schedule handling).
 * Candidates, history and Recovery Days only ever contain the current user's data (AUTH-003).
 * CARRY_OVER lives in {@link CarryOverService} because it needs its own preview.
 */
@Service
@Transactional
public class RecoveryService {

    private static final Set<DayStatus> FINISHED = Set.of(DayStatus.DONE, DayStatus.SKIPPED);
    private static final Set<DayStatus> OPEN = Set.of(DayStatus.NOT_STARTED, DayStatus.IN_PROGRESS, DayStatus.DEFERRED);
    private static final int MAX_HISTORY = 100;

    private final DayService dayService;
    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final RecoveryEventRepository events;
    private final RecoveryDayRepository recoveryDays;
    private final CurrentUser currentUser;

    public RecoveryService(DayService dayService, DayRepository days, DayScheduleRepository schedules,
            RecoveryEventRepository events, RecoveryDayRepository recoveryDays, CurrentUser currentUser) {
        this.dayService = dayService;
        this.days = days;
        this.schedules = schedules;
        this.events = events;
        this.recoveryDays = recoveryDays;
        this.currentUser = currentUser;
    }

    /**
     * REC-001 missed Days as of the user's {@code today} and the instant {@code now}: unfinished Days planned
     * before today, and unfinished Days of today whose time placement has already ended. Date-only Days of
     * today are not missed yet. A Day whose latest decision recorded its current planning state is left out
     * (REC-005); any later change of that state makes it a candidate again.
     */
    @Transactional(readOnly = true)
    public List<RecoveryCandidateResponse> candidates(LocalDate today, Instant now) {
        List<Day> open = days.findByUserIdAndStatusInAndPlannedDateLessThanEqual(currentUser.id(), OPEN, today);
        Map<UUID, DaySchedule> scheduleByDay = schedules.findByDayIdIn(open.stream().map(Day::getId).toList()).stream()
                .collect(Collectors.toMap(DaySchedule::getDayId, Function.identity()));

        Map<UUID, RecoveryCandidateReason> reasons = new HashMap<>();
        for (Day day : open) {
            DaySchedule schedule = scheduleByDay.get(day.getId());
            if (day.getPlannedDate().isBefore(today)) {
                reasons.put(day.getId(), RecoveryCandidateReason.PAST_DATE);
            } else if (schedule != null && schedule.getEndAt().isBefore(now)) {
                reasons.put(day.getId(), RecoveryCandidateReason.TIME_PASSED);
            }
        }

        Map<UUID, RecoveryEventItem> latest = latestDecisions(reasons.keySet());
        List<RecoveryCandidateResponse> result = new ArrayList<>();
        for (Day day : open) {
            RecoveryCandidateReason reason = reasons.get(day.getId());
            if (reason == null) {
                continue;
            }
            DaySchedule schedule = scheduleByDay.get(day.getId());
            RecoveryEventItem last = latest.get(day.getId());
            if (last != null && Objects.equals(last.getPlanningState(), RecoveryPlanningState.of(day, schedule))) {
                continue;
            }
            result.add(new RecoveryCandidateResponse(DayResponse.from(day, schedule), reason,
                    last == null ? null : last.getAction()));
        }
        result.sort(Comparator.comparing((RecoveryCandidateResponse candidate) -> candidate.day().plannedDate())
                .thenComparing(candidate -> candidate.day().title()));
        return result;
    }

    /** Applies every decision in one transaction; any invalid or stale decision rolls back all of them. */
    public ApplyRecoveryResponse apply(ApplyRecoveryRequest request) {
        UUID userId = currentUser.id();
        RecoveryEvent event = new RecoveryEvent(userId, request.localDate());
        List<DayResponse> results = new ArrayList<>();
        Set<Object> seenDays = new HashSet<>();

        for (int index = 0; index < request.decisions().size(); index++) {
            RecoveryDecisionRequest decision = request.decisions().get(index);
            String field = "decisions[" + index + "]";
            if (!seenDays.add(decision.dayId())) {
                throw invalid(field + ".dayId", "Each Day can only have one decision.");
            }

            Day day = days.findByIdAndUserId(decision.dayId(), userId)
                    .orElseThrow(() -> new ApiException(ErrorCode.DAY_NOT_FOUND,
                            "Day " + decision.dayId() + " was not found.", field + ".dayId"));
            if (!Objects.equals(day.getVersion(), decision.version())) {
                throw new ApiException(ErrorCode.VERSION_CONFLICT,
                        "A Day was changed by another request. Reload and try again.", field + ".version");
            }
            if (FINISHED.contains(day.getStatus())) {
                throw invalid(field + ".dayId", "Only unfinished Days can be recovered.");
            }

            String previousTitle = day.getTitle();
            DayStatus previousStatus = day.getStatus();
            LocalDate previousDate = day.getPlannedDate();
            int previousMinutes = day.getEstimatedMinutes();
            DayResponse result = switch (decision.action()) {
                case KEEP -> dayService.get(day.getId());
                case REDUCE -> reduce(day, decision, field);
                case MOVE -> move(day, decision, request.localDate(), field);
                case DROP -> drop(day, decision);
                case CARRY_OVER -> throw invalid(field + ".action",
                        "CARRY_OVER has its own preview and apply (/recovery/carry-over).");
            };

            // The state right after the decision: while the Day keeps it, it is not offered again (REC-005).
            Day after = days.findByIdAndUserId(day.getId(), userId).orElseThrow();
            String state = RecoveryPlanningState.of(after, schedules.findByDayId(day.getId()).orElse(null));
            event.addItem(new RecoveryEventItem(day.getId(), previousTitle, decision.action(), previousStatus,
                    result.status(), previousDate, result.plannedDate(), previousMinutes, result.estimatedMinutes(),
                    null, state));
            results.add(result);
        }

        RecoveryEvent saved = events.saveAndFlush(event);
        return new ApplyRecoveryResponse(saved.getId(), saved.getLocalDate(), saved.getAppliedAt(), results);
    }

    /** REC-005 history, newest first. Read only. */
    @Transactional(readOnly = true)
    public List<RecoveryEventResponse> history(int limit) {
        UUID userId = currentUser.id();
        List<RecoveryEvent> found = events.findAllByUserIdOrderByAppliedAtDesc(userId,
                PageRequest.of(0, Math.min(Math.max(limit, 1), MAX_HISTORY)));
        Set<UUID> dayIds = new HashSet<>();
        for (RecoveryEvent event : found) {
            for (RecoveryEventItem item : event.getItems()) {
                if (item.getDayId() != null) {
                    dayIds.add(item.getDayId());
                }
                if (item.getDestinationDayId() != null) {
                    dayIds.add(item.getDestinationDayId());
                }
            }
        }
        Map<UUID, Day> dayById = days.findByUserIdAndIdIn(userId, dayIds).stream()
                .collect(Collectors.toMap(Day::getId, Function.identity()));

        return found.stream().map(event -> new RecoveryEventResponse(event.getId(), event.getLocalDate(),
                event.getAppliedAt(), event.getItems().stream().map(item -> {
                    Day day = item.getDayId() == null ? null : dayById.get(item.getDayId());
                    Day destination = item.getDestinationDayId() == null ? null : dayById.get(item.getDestinationDayId());
                    return new RecoveryEventItemResponse(item.getId(), item.getDayId(),
                            item.getDayTitle() != null ? item.getDayTitle() : (day == null ? null : day.getTitle()),
                            item.getAction(), item.getPreviousStatus(), item.getNewStatus(),
                            item.getPreviousPlannedDate(), item.getNewPlannedDate(),
                            item.getPreviousEstimatedMinutes(), item.getNewEstimatedMinutes(),
                            item.getDestinationDayId(), destination == null ? null : destination.getTitle(),
                            destination == null ? null : destination.getPlannedDate());
                }).toList())).toList();
    }

    @Transactional(readOnly = true)
    public List<RecoveryDayResponse> listDays(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "from must be on or before to.", "from");
        }
        return recoveryDays.findByUserIdAndDateBetweenOrderByDate(currentUser.id(), from, to).stream()
                .map(RecoveryDayResponse::from)
                .toList();
    }

    /**
     * Creates or updates a recovery day for any date (today or ahead) and, in the same transaction,
     * un-marks the core Days the user chose to release on that date. A stale Day or recovery day
     * version rolls back everything.
     */
    public RecoveryDayResponse saveDay(LocalDate date, SaveRecoveryDayRequest request) {
        if (request.returnDate() != null && !request.returnDate().isAfter(date)) {
            throw new ApiException(ErrorCode.INVALID_RECOVERY_RETURN_DATE,
                    "The return date must be after the recovery day.", "returnDate");
        }
        UUID userId = currentUser.id();
        RecoveryDay recoveryDay = recoveryDays.findByUserIdAndDate(userId, date).orElse(null);
        Long currentVersion = recoveryDay == null ? null : recoveryDay.getVersion();
        if (!Objects.equals(currentVersion, request.expectedVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The recovery day was changed by another request. Reload and try again.", "expectedVersion");
        }

        List<VersionedIdRequest> releases = request.releaseCoreDays() == null ? List.of() : request.releaseCoreDays();
        for (int index = 0; index < releases.size(); index++) {
            VersionedIdRequest release = releases.get(index);
            String field = "releaseCoreDays[" + index + "]";
            Day day = days.findByIdAndUserId(release.id(), userId)
                    .orElseThrow(() -> new ApiException(ErrorCode.DAY_NOT_FOUND, "Day " + release.id() + " was not found.",
                            field + ".id"));
            if (!date.equals(day.getPlannedDate()) || !day.isCoreDay()) {
                throw new ApiException(ErrorCode.VALIDATION_ERROR,
                        "Only core Days planned on the recovery day can be released.", field + ".id");
            }
            UpdateDayRequest update = new UpdateDayRequest();
            update.setVersion(release.version());
            update.setCoreDay(false);
            dayService.update(day.getId(), update);
        }

        if (recoveryDay == null) {
            recoveryDay = new RecoveryDay(userId, date);
        }
        recoveryDay.update(request.returnDate(), request.note().strip());
        return RecoveryDayResponse.from(recoveryDays.saveAndFlush(recoveryDay));
    }

    public void deleteDay(LocalDate date) {
        RecoveryDay recoveryDay = recoveryDays.findByUserIdAndDate(currentUser.id(), date)
                .orElseThrow(() -> new ApiException(ErrorCode.RECOVERY_DAY_NOT_FOUND,
                        date + " is not a recovery day."));
        recoveryDays.delete(recoveryDay);
    }

    /** The newest decision of each Day. */
    private Map<UUID, RecoveryEventItem> latestDecisions(Set<UUID> dayIds) {
        Map<UUID, RecoveryEventItem> latest = new HashMap<>();
        if (dayIds.isEmpty()) {
            return latest;
        }
        for (RecoveryEventItem item : events.findItemsNewestFirst(currentUser.id(), dayIds)) {
            latest.putIfAbsent(item.getDayId(), item);
        }
        return latest;
    }

    private DayResponse reduce(Day day, RecoveryDecisionRequest decision, String field) {
        Integer minutes = decision.estimatedMinutes();
        if (minutes == null || minutes >= day.getEstimatedMinutes()) {
            throw invalid(field + ".estimatedMinutes", "REDUCE needs an estimate smaller than " + day.getEstimatedMinutes() + " minutes.");
        }
        UpdateDayRequest update = versioned(decision);
        update.setEstimatedMinutes(minutes);
        if (decision.title() != null) {
            if (decision.title().isBlank()) {
                throw invalid(field + ".title", "The reduced title must not be blank.");
            }
            update.setTitle(decision.title());
        }
        return dayService.update(day.getId(), update);
    }

    /**
     * MOVE to today or a later date. A Day with a Goal stays inside its WEEK or PERIOD Goal (checked by
     * DayService: another week is a CARRY_OVER); a Day without a Goal can go to any later date. The schedule is
     * removed first so it is not carried to the new date.
     */
    private DayResponse move(Day day, RecoveryDecisionRequest decision, LocalDate today, String field) {
        if (decision.plannedDate() == null) {
            throw invalid(field + ".plannedDate", "MOVE needs a plannedDate.");
        }
        if (decision.plannedDate().isBefore(today)) {
            throw invalid(field + ".plannedDate", "MOVE goes to today or a later date.");
        }
        if (schedules.findByDayId(day.getId()).isPresent()) {
            dayService.deleteSchedule(day.getId());
        }
        UpdateDayRequest update = versioned(decision);
        update.setPlannedDate(decision.plannedDate());
        return dayService.update(day.getId(), update);
    }

    private DayResponse drop(Day day, RecoveryDecisionRequest decision) {
        UpdateDayRequest update = versioned(decision);
        update.setStatus(DayStatus.SKIPPED);
        return dayService.update(day.getId(), update);
    }

    private static UpdateDayRequest versioned(RecoveryDecisionRequest decision) {
        UpdateDayRequest update = new UpdateDayRequest();
        update.setVersion(decision.version());
        return update;
    }

    private static ApiException invalid(String field, String message) {
        return new ApiException(ErrorCode.INVALID_RECOVERY_DECISION, message, field);
    }
}
