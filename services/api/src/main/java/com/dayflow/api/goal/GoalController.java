package com.dayflow.api.goal;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.goal.GoalDtos.CreateGoalRequest;
import com.dayflow.api.goal.GoalDtos.GoalResponse;
import com.dayflow.api.goal.GoalDtos.UpdateGoalRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
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
@ApiResponse(responseCode = "400", description = "Invalid request or Goal rule violation",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class GoalController {

    private final GoalService goalService;

    public GoalController(GoalService goalService) {
        this.goalService = goalService;
    }

    /** @ResponseStatus documents 201 in OpenAPI; ResponseEntity adds the Location header. */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createGoal")
    public ResponseEntity<GoalResponse> create(@Valid @RequestBody CreateGoalRequest request) {
        GoalResponse goal = goalService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/goals/" + goal.id())).body(goal);
    }

    /** Filter by type and/or period overlap (from/to are inclusive dates). */
    // Explicit 200: with method-level @ApiResponse, springdoc no longer infers the success response.
    @GetMapping
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listGoals")
    public List<GoalResponse> list(
            @RequestParam(required = false) GoalKind kind,
            @RequestParam(required = false) GoalType type,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return goalService.list(kind, type, from, to);
    }

    @GetMapping("/{goalId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getGoal")
    @ApiResponse(responseCode = "404", description = "Goal not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public GoalResponse get(@PathVariable UUID goalId) {
        return goalService.get(goalId);
    }

    @PatchMapping("/{goalId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "updateGoal")
    @ApiResponse(responseCode = "404", description = "Goal not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Stale version (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public GoalResponse update(@PathVariable UUID goalId, @Valid @RequestBody UpdateGoalRequest request) {
        return goalService.update(goalId, request);
    }

    @DeleteMapping("/{goalId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteGoal")
    @ApiResponse(responseCode = "404", description = "Goal not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Goal still has child Goals or Days (GOAL_IN_USE)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public void delete(@PathVariable UUID goalId) {
        goalService.delete(goalId);
    }
}
