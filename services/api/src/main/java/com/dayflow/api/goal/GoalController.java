package com.dayflow.api.goal;

import com.dayflow.api.goal.GoalDtos.CreateGoalRequest;
import com.dayflow.api.goal.GoalDtos.GoalResponse;
import com.dayflow.api.goal.GoalDtos.UpdateGoalRequest;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/goals")
public class GoalController {

    private final GoalService goalService;

    public GoalController(GoalService goalService) {
        this.goalService = goalService;
    }

    /** @ResponseStatus documents 201 in OpenAPI; ResponseEntity adds the Location header. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ResponseEntity<GoalResponse> create(@Valid @RequestBody CreateGoalRequest request) {
        GoalResponse goal = goalService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/goals/" + goal.id())).body(goal);
    }

    /** Filter by type and/or period overlap (from/to are inclusive dates). */
    @GetMapping
    public List<GoalResponse> list(
            @RequestParam(required = false) GoalType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return goalService.list(type, from, to);
    }

    @GetMapping("/{goalId}")
    public GoalResponse get(@PathVariable UUID goalId) {
        return goalService.get(goalId);
    }

    @PatchMapping("/{goalId}")
    public GoalResponse update(@PathVariable UUID goalId, @Valid @RequestBody UpdateGoalRequest request) {
        return goalService.update(goalId, request);
    }

    @DeleteMapping("/{goalId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID goalId) {
        goalService.delete(goalId);
    }
}
