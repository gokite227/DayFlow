package com.dayflow.api.recovery;

import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.Day;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayDtos.UpdateDayRequest;
import com.dayflow.api.day.DayRepository;
import com.dayflow.api.day.DayScheduleRepository;
import com.dayflow.api.day.DayService;
import com.dayflow.api.day.DayStatus;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryRequest;
import com.dayflow.api.recovery.RecoveryDtos.ApplyRecoveryResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDayResponse;
import com.dayflow.api.recovery.RecoveryDtos.RecoveryDecisionRequest;
import com.dayflow.api.recovery.RecoveryDtos.SaveRecoveryDayRequest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * REC-001 recovery plans and REC-002 recovery days. Day changes go through DayService, so the
 * same rules as PATCH /days apply (versions, WEEK Goal period, schedule handling).
 */
@Service
@Transactional
public class RecoveryService {

    private static final Set<DayStatus> FINISHED = Set.of(DayStatus.DONE, DayStatus.SKIPPED);

    private final DayService dayService;
    private final DayRepository days;
    private final DayScheduleRepository schedules;
    private final RecoveryEventRepository events;
    private final RecoveryDayRepository recoveryDays;

    public RecoveryService(DayService dayService, DayRepository days, DayScheduleRepository schedules,
            RecoveryEventRepository events, RecoveryDayRepository recoveryDays) {
        this.dayService = dayService;
        this.days = days;
        this.schedules = schedules;
        this.events = events;
        this.recoveryDays = recoveryDays;
    }

    /** Applies every decision in one transaction; any invalid or stale decision rolls back all of them. */
    public ApplyRecoveryResponse apply(ApplyRecoveryRequest request) {
        RecoveryEvent event = new RecoveryEvent(request.localDate());
        List<DayResponse> results = new ArrayList<>();
        Set<Object> seenDays = new HashSet<>();

        for (int index = 0; index < request.decisions().size(); index++) {
            RecoveryDecisionRequest decision = request.decisions().get(index);
            String field = "decisions[" + index + "]";
            if (!seenDays.add(decision.dayId())) {
                throw invalid(field + ".dayId", "Each Day can only have one decision.");
            }

            Day day = days.findById(decision.dayId())
                    .orElseThrow(() -> new ApiException(ErrorCode.DAY_NOT_FOUND,
                            "Day " + decision.dayId() + " was not found.", field + ".dayId"));
            if (!Objects.equals(day.getVersion(), decision.version())) {
                throw new ApiException(ErrorCode.VERSION_CONFLICT,
                        "A Day was changed by another request. Reload and try again.", field + ".version");
            }
            if (FINISHED.contains(day.getStatus())) {
                throw invalid(field + ".dayId", "Only unfinished Days can be recovered.");
            }

            DayStatus previousStatus = day.getStatus();
            LocalDate previousDate = day.getPlannedDate();
            int previousMinutes = day.getEstimatedMinutes();
            DayResponse result = switch (decision.action()) {
                case KEEP -> dayService.get(day.getId());
                case REDUCE -> reduce(day, decision, field);
                case MOVE -> move(day, decision, field);
                case DROP -> drop(day, decision);
            };

            event.addItem(new RecoveryEventItem(day.getId(), decision.action(), previousStatus, result.status(),
                    previousDate, result.plannedDate(), previousMinutes, result.estimatedMinutes()));
            results.add(result);
        }

        RecoveryEvent saved = events.saveAndFlush(event);
        return new ApplyRecoveryResponse(saved.getId(), saved.getLocalDate(), saved.getAppliedAt(), results);
    }

    @Transactional(readOnly = true)
    public List<RecoveryDayResponse> listDays(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "from must be on or before to.", "from");
        }
        return recoveryDays.findByDateBetweenOrderByDate(from, to).stream().map(RecoveryDayResponse::from).toList();
    }

    public RecoveryDayResponse saveDay(LocalDate date, SaveRecoveryDayRequest request) {
        if (request.returnDate() != null && !request.returnDate().isAfter(date)) {
            throw new ApiException(ErrorCode.INVALID_RECOVERY_RETURN_DATE,
                    "The return date must be after the recovery day.", "returnDate");
        }
        RecoveryDay recoveryDay = recoveryDays.findByDate(date).orElse(null);
        Long currentVersion = recoveryDay == null ? null : recoveryDay.getVersion();
        if (!Objects.equals(currentVersion, request.expectedVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The recovery day was changed by another request. Reload and try again.", "expectedVersion");
        }
        if (recoveryDay == null) {
            recoveryDay = new RecoveryDay(date);
        }
        recoveryDay.update(request.returnDate(), request.note().strip());
        return RecoveryDayResponse.from(recoveryDays.saveAndFlush(recoveryDay));
    }

    public void deleteDay(LocalDate date) {
        RecoveryDay recoveryDay = recoveryDays.findByDate(date)
                .orElseThrow(() -> new ApiException(ErrorCode.RECOVERY_DAY_NOT_FOUND,
                        date + " is not a recovery day."));
        recoveryDays.delete(recoveryDay);
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

    /** Moves to a date-only Day: the schedule is removed first so it is not carried to the new date. */
    private DayResponse move(Day day, RecoveryDecisionRequest decision, String field) {
        if (decision.plannedDate() == null) {
            throw invalid(field + ".plannedDate", "MOVE needs a plannedDate.");
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
