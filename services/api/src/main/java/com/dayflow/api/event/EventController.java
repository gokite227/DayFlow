package com.dayflow.api.event;

import com.dayflow.api.common.ProblemResponse;
import com.dayflow.api.event.EventDtos.CreateEventRequest;
import com.dayflow.api.event.EventDtos.EventOccurrenceResponse;
import com.dayflow.api.event.EventDtos.EventResponse;
import com.dayflow.api.event.EventDtos.UpdateEventRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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

/** Event CRUD and computed occurrences (requirements §9.2). Separate from the Day API. */
@RestController
@RequestMapping("/api/v1")
@ApiResponse(responseCode = "400", description = "Invalid request or Event rule violation",
        content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
public class EventController {

    private final EventService eventService;

    public EventController(EventService eventService) {
        this.eventService = eventService;
    }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(operationId = "createEvent")
    public ResponseEntity<EventResponse> create(@Valid @RequestBody CreateEventRequest request) {
        EventResponse event = eventService.create(request);
        return ResponseEntity.created(URI.create("/api/v1/events/" + event.id())).body(event);
    }

    @GetMapping("/events")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listEvents")
    public List<EventResponse> list(
            @Parameter(description = "Only Events of this Category") @RequestParam(required = false) UUID categoryId,
            @Parameter(description = "false: only uncategorized Events (미분류); true: only categorized ones")
            @RequestParam(required = false) Boolean hasCategory,
            @RequestParam(required = false) UUID linkedGoalId) {
        return eventService.list(categoryId, hasCategory, linkedGoalId);
    }

    @GetMapping("/events/{eventId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getEvent")
    @ApiResponse(responseCode = "404", description = "Event not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public EventResponse get(@PathVariable UUID eventId) {
        return eventService.get(eventId);
    }

    @PatchMapping("/events/{eventId}")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "updateEvent")
    @ApiResponse(responseCode = "404", description = "Event not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Stale version (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public EventResponse update(@PathVariable UUID eventId, @Valid @RequestBody UpdateEventRequest request) {
        return eventService.update(eventId, request);
    }

    @DeleteMapping("/events/{eventId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(operationId = "deleteEvent")
    @ApiResponse(responseCode = "404", description = "Event not found",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    @ApiResponse(responseCode = "409", description = "Stale version (VERSION_CONFLICT)",
            content = @Content(mediaType = ProblemResponse.MEDIA_TYPE, schema = @Schema(implementation = ProblemResponse.class)))
    public void delete(@PathVariable UUID eventId,
            @Parameter(description = "The Event version the user saw") @RequestParam long version) {
        eventService.delete(eventId, version);
    }

    /** from/to are inclusive local dates in each Event's timezone; at most 366 days. */
    @GetMapping("/event-occurrences")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "listEventOccurrences")
    public List<EventOccurrenceResponse> occurrences(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @Parameter(description = "Only occurrences of this Category") @RequestParam(required = false) UUID categoryId,
            @Parameter(description = "false: only uncategorized Events (미분류); true: only categorized ones")
            @RequestParam(required = false) Boolean hasCategory) {
        return eventService.occurrences(from, to, categoryId, hasCategory);
    }
}
