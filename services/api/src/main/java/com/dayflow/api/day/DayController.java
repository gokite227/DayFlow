package com.dayflow.api.day;

import com.dayflow.api.day.DayDtos.CreateDayRequest;
import com.dayflow.api.day.DayDtos.DayResponse;
import com.dayflow.api.day.DayDtos.SetDayScheduleRequest;
import com.dayflow.api.day.DayDtos.UpdateDayRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/days")
public class DayController {

    private final DayService dayService;

    public DayController(DayService dayService) {
        this.dayService = dayService;
    }

    /** @ResponseStatus documents 201 in OpenAPI; ResponseEntity adds the Location header. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<DayResponse> create(@Valid @RequestBody CreateDayRequest request) {
        DayResponse day = dayService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/days/" + day.id())).body(day);
    }

    /** from/to filter plannedDate inclusively; Days without a date are excluded when either is set. */
    @GetMapping
    public List<DayResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID goalId,
            @RequestParam(required = false) DayStatus status) {
        return dayService.list(from, to, goalId, status);
    }

    @GetMapping("/{dayId}")
    public DayResponse get(@PathVariable UUID dayId) {
        return dayService.get(dayId);
    }

    @PatchMapping("/{dayId}")
    public DayResponse update(@PathVariable UUID dayId, @Valid @RequestBody UpdateDayRequest request) {
        return dayService.update(dayId, request);
    }

    @DeleteMapping("/{dayId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID dayId) {
        dayService.delete(dayId);
    }

    @PutMapping("/{dayId}/schedule")
    public DayResponse setSchedule(@PathVariable UUID dayId, @Valid @RequestBody SetDayScheduleRequest request) {
        return dayService.setSchedule(dayId, request);
    }

    @DeleteMapping("/{dayId}/schedule")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteSchedule(@PathVariable UUID dayId) {
        dayService.deleteSchedule(dayId);
    }
}
