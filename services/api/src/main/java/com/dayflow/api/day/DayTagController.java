package com.dayflow.api.day;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.day.DayTagDtos.CreateDayTagRequest;
import com.dayflow.api.day.DayTagDtos.DayTagResponse;
import com.dayflow.api.day.DayTagDtos.UpdateDayTagRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** DAY-005 Day Tags: a small CRUD used by the Days screen and the Day form. */
@RestController
@RequestMapping("/api/v1/day-tags")
@ApiResponse(responseCode = "400", description = "Invalid request or Tag rule violation",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class DayTagController {

    private final DayTagService dayTagService;

    public DayTagController(DayTagService dayTagService) {
        this.dayTagService = dayTagService;
    }

    @GetMapping
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listDayTags")
    public List<DayTagResponse> list() {
        return dayTagService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createDayTag")
    public ResponseEntity<DayTagResponse> create(@Valid @RequestBody CreateDayTagRequest request) {
        DayTagResponse tag = dayTagService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/day-tags/" + tag.id())).body(tag);
    }

    @PatchMapping("/{tagId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "updateDayTag")
    @ApiResponse(responseCode = "404", description = "Tag not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Stale version (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public DayTagResponse update(@PathVariable UUID tagId, @Valid @RequestBody UpdateDayTagRequest request) {
        return dayTagService.update(tagId, request);
    }

    /** The Days keep their data; only the links to this Tag are removed. */
    @DeleteMapping("/{tagId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteDayTag")
    @ApiResponse(responseCode = "404", description = "Tag not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public void delete(@PathVariable UUID tagId) {
        dayTagService.delete(tagId);
    }
}
