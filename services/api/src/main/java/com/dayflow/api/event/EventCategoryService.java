package com.dayflow.api.event;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.event.EventCategoryDtos.CreateEventCategoryRequest;
import com.dayflow.api.event.EventCategoryDtos.EventCategoryResponse;
import com.dayflow.api.event.EventCategoryDtos.UpdateEventCategoryRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * EVT-006 Event Category rules: trimmed names, case-insensitive uniqueness, palette colors, sort order. All
 * rules apply per user (AUTH-003).
 */
@Service
@Transactional
public class EventCategoryService {

    private final EventCategoryRepository categories;
    private final CurrentUser currentUser;

    public EventCategoryService(EventCategoryRepository categories, CurrentUser currentUser) {
        this.categories = categories;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<EventCategoryResponse> list() {
        return categories.findAllByUserIdOrderBySortOrderAscNameAsc(currentUser.id()).stream()
                .map(EventCategoryResponse::from)
                .toList();
    }

    public EventCategoryResponse create(CreateEventCategoryRequest request) {
        String name = requireName(request.name());
        requireUniqueName(name, null);
        int sortOrder = request.sortOrder() != null ? request.sortOrder() : nextSortOrder();
        EventCategory category = new EventCategory(currentUser.id(), name,
                EventCategoryColors.normalize(request.color()), sortOrder);
        return EventCategoryResponse.from(categories.saveAndFlush(category));
    }

    /**
     * AUTH-002: the six default Categories of a new user. Called while the user is created, before any access
     * token exists, so the owner is passed in; it joins the caller's transaction.
     */
    public void createDefaults(UUID userId) {
        List<EventCategory> defaults = new ArrayList<>();
        for (int index = 0; index < EventCategoryColors.DEFAULT_NAMES.size(); index++) {
            defaults.add(new EventCategory(userId, EventCategoryColors.DEFAULT_NAMES.get(index),
                    EventCategoryColors.PALETTE.get(index), index));
        }
        categories.saveAllAndFlush(defaults);
    }

    public EventCategoryResponse update(UUID id, UpdateEventCategoryRequest request) {
        EventCategory category = find(id);
        if (!Objects.equals(category.getVersion(), request.getVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The Category was changed by another request. Reload and try again.", "version");
        }
        if (!request.hasAnyChange()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "At least one Category field must be provided.");
        }
        if (request.getName() != null) {
            String name = requireName(request.getName());
            requireUniqueName(name, id);
            category.setName(name);
        }
        if (request.getColor() != null) {
            category.setColor(EventCategoryColors.normalize(request.getColor()));
        }
        if (request.getSortOrder() != null) {
            category.setSortOrder(request.getSortOrder());
        }
        return EventCategoryResponse.from(categories.saveAndFlush(category));
    }

    /**
     * The Events of the Category stay and become uncategorized (database ON DELETE SET NULL). A Category only
     * ever has Events of its own user, so no other user's Event changes.
     */
    public void delete(UUID id) {
        categories.delete(find(id));
        categories.flush();
    }

    /** The Category an Event request refers to; null means uncategorized. Another user's Category is unknown. */
    @Transactional(readOnly = true)
    public EventCategory resolve(UUID id) {
        if (id == null) {
            return null;
        }
        return categories.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.INVALID_EVENT_CATEGORY,
                        "Event Category " + id + " was not found.", "categoryId"));
    }

    private EventCategory find(UUID id) {
        return categories.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.EVENT_CATEGORY_NOT_FOUND,
                        "Event Category " + id + " was not found."));
    }

    private static String requireName(String rawName) {
        String name = rawName.strip();
        if (name.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "name must not be blank.", "name");
        }
        if (name.length() > EventCategoryDtos.MAX_NAME_LENGTH) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "name must be at most " + EventCategoryDtos.MAX_NAME_LENGTH + " characters.", "name");
        }
        return name;
    }

    private void requireUniqueName(String name, UUID selfId) {
        categories.findFirstByUserIdAndNameIgnoreCase(currentUser.id(), name)
                .filter(existing -> !existing.getId().equals(selfId))
                .ifPresent(existing -> {
                    throw new ApiException(ErrorCode.DUPLICATE_EVENT_CATEGORY_NAME,
                            "A Category named \"" + existing.getName() + "\" already exists.", "name");
                });
    }

    private int nextSortOrder() {
        return categories.findAllByUserIdOrderBySortOrderAscNameAsc(currentUser.id()).stream()
                .mapToInt(EventCategory::getSortOrder)
                .max()
                .orElse(-1) + 1;
    }
}
