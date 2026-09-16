package com.dayflow.api.day;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.day.DayTagDtos.CreateDayTagRequest;
import com.dayflow.api.day.DayTagDtos.DayTagResponse;
import com.dayflow.api.day.DayTagDtos.UpdateDayTagRequest;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** DAY-005 Day Tag rules: trimmed names, case-insensitive uniqueness, palette colors, sort order. */
@Service
@Transactional
public class DayTagService {

    /** DAY-005: a Day carries at most this many Tags. */
    public static final int MAX_TAGS_PER_DAY = 10;

    private final DayTagRepository tags;
    private final CurrentUser currentUser;

    public DayTagService(DayTagRepository tags, CurrentUser currentUser) {
        this.tags = tags;
        this.currentUser = currentUser;
    }

    @Transactional(readOnly = true)
    public List<DayTagResponse> list() {
        return tags.findAllByUserIdOrderBySortOrderAscNameAsc(currentUser.id()).stream().map(DayTagResponse::from)
                .toList();
    }

    public DayTagResponse create(CreateDayTagRequest request) {
        String name = requireName(request.name());
        requireUniqueName(name, null);
        int sortOrder = request.sortOrder() != null ? request.sortOrder() : nextSortOrder();

        DayTag tag = new DayTag(currentUser.id(), name, DayTagColors.normalize(request.color()), sortOrder);
        return DayTagResponse.from(tags.saveAndFlush(tag));
    }

    public DayTagResponse update(UUID id, UpdateDayTagRequest request) {
        DayTag tag = find(id);
        if (!Objects.equals(tag.getVersion(), request.getVersion())) {
            throw new ApiException(ErrorCode.VERSION_CONFLICT,
                    "The Tag was changed by another request. Reload and try again.", "version");
        }
        if (!request.hasAnyChange()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "At least one Tag field must be provided.");
        }

        if (request.getName() != null) {
            String name = requireName(request.getName());
            requireUniqueName(name, id);
            tag.setName(name);
        }
        if (request.getColor() != null) {
            tag.setColor(DayTagColors.normalize(request.getColor()));
        }
        if (request.getSortOrder() != null) {
            tag.setSortOrder(request.getSortOrder());
        }
        return DayTagResponse.from(tags.saveAndFlush(tag));
    }

    /** Deleting a Tag removes only its links to Days (database cascade); the Days are kept. */
    public void delete(UUID id) {
        tags.delete(find(id));
    }

    /**
     * Tags of a Day request, in the order they are stored. Unknown ids, another user's Tags and more than
     * MAX_TAGS_PER_DAY are rejected; duplicates in the request are ignored.
     */
    @Transactional(readOnly = true)
    public Set<DayTag> resolve(Collection<UUID> tagIds) {
        if (tagIds == null || tagIds.isEmpty()) {
            return Set.of();
        }
        Set<UUID> wanted = new LinkedHashSet<>(tagIds);
        if (wanted.size() > MAX_TAGS_PER_DAY) {
            throw new ApiException(ErrorCode.TOO_MANY_DAY_TAGS,
                    "A Day can have at most " + MAX_TAGS_PER_DAY + " Tags.", "tagIds");
        }
        Map<UUID, DayTag> found = tags.findByUserIdAndIdIn(currentUser.id(), wanted).stream()
                .collect(Collectors.toMap(DayTag::getId, Function.identity()));
        Set<DayTag> resolved = new LinkedHashSet<>();
        for (UUID tagId : wanted) {
            DayTag tag = found.get(tagId);
            if (tag == null) {
                throw new ApiException(ErrorCode.INVALID_DAY_TAG, "Tag " + tagId + " was not found.", "tagIds");
            }
            resolved.add(tag);
        }
        return resolved;
    }

    private DayTag find(UUID id) {
        return tags.findByIdAndUserId(id, currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.DAY_TAG_NOT_FOUND, "Tag " + id + " was not found."));
    }

    /** Names are stored trimmed, so the length rule is checked on the trimmed value. */
    private static String requireName(String rawName) {
        String name = rawName.strip();
        if (name.isEmpty()) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR, "name must not be blank.", "name");
        }
        if (name.length() > DayTagDtos.MAX_NAME_LENGTH) {
            throw new ApiException(ErrorCode.VALIDATION_ERROR,
                    "name must be at most " + DayTagDtos.MAX_NAME_LENGTH + " characters.", "name");
        }
        return name;
    }

    private void requireUniqueName(String name, UUID selfId) {
        tags.findFirstByUserIdAndNameIgnoreCase(currentUser.id(), name)
                .filter(existing -> !existing.getId().equals(selfId))
                .ifPresent(existing -> {
                    throw new ApiException(ErrorCode.DUPLICATE_DAY_TAG_NAME,
                            "A Tag named \"" + existing.getName() + "\" already exists.", "name");
                });
    }

    private int nextSortOrder() {
        return tags.findAllByUserIdOrderBySortOrderAscNameAsc(currentUser.id()).stream()
                .mapToInt(DayTag::getSortOrder)
                .max()
                .orElse(-1) + 1;
    }
}
