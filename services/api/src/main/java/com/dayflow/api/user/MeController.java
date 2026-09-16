package com.dayflow.api.user;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.dayflow.api.auth.CurrentUser;
import com.dayflow.api.common.ApiException;
import com.dayflow.api.common.ErrorCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** AUTH-002: the signed-in user's profile. Provider subjects and tokens are never part of it. */
@RestController
public class MeController {

    public record MeResponse(
            @Schema(requiredMode = REQUIRED) UUID id,
            @Schema(requiredMode = REQUIRED) String email,
            @Schema(requiredMode = REQUIRED) String displayName,
            @Schema(requiredMode = REQUIRED, types = {"string", "null"}) String avatarUrl) {
    }

    private final UserRepository users;
    private final CurrentUser currentUser;

    public MeController(UserRepository users, CurrentUser currentUser) {
        this.users = users;
        this.currentUser = currentUser;
    }

    @GetMapping("/api/v1/me")
    @ResponseStatus(HttpStatus.OK)
    @Operation(operationId = "getMe")
    public MeResponse me() {
        // A still valid token of a user that no longer exists (e.g. a reset development database) signs out.
        User user = users.findById(currentUser.id())
                .orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED, "The signed-in user no longer exists."));
        return new MeResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
    }
}
