package com.dayflow.api.event;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.event.EventCategoryDtos.CreateEventCategoryRequest;
import com.dayflow.api.event.EventCategoryDtos.EventCategoryResponse;
import com.dayflow.api.event.EventCategoryDtos.UpdateEventCategoryRequest;
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

/** EVT-006 Event Categories. Separate from Day Tags. */
@RestController
@RequestMapping("/api/v1/event-categories")
@ApiResponse(responseCode = "400", description = "Invalid request or Category rule violation",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class EventCategoryController {

    private final EventCategoryService categoryService;

    public EventCategoryController(EventCategoryService categoryService) {
        this.categoryService = categoryService;
    }

    /** In sortOrder, then name. */
    @GetMapping
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listEventCategories")
    public List<EventCategoryResponse> list() {
        return categoryService.list();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createEventCategory")
    public ResponseEntity<EventCategoryResponse> create(@Valid @RequestBody CreateEventCategoryRequest request) {
        EventCategoryResponse category = categoryService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/event-categories/" + category.id())).body(category);
    }

    @PatchMapping("/{categoryId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "updateEventCategory")
    @ApiResponse(responseCode = "404", description = "Category not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Stale version (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public EventCategoryResponse update(@PathVariable UUID categoryId,
            @Valid @RequestBody UpdateEventCategoryRequest request) {
        return categoryService.update(categoryId, request);
    }

    /** The Events keep their data and become uncategorized. */
    @DeleteMapping("/{categoryId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteEventCategory")
    @ApiResponse(responseCode = "404", description = "Category not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public void delete(@PathVariable UUID categoryId) {
        categoryService.delete(categoryId);
    }
}
