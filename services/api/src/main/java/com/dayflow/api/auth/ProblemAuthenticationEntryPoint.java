package com.dayflow.api.auth;

import com.dayflow.api.common.ErrorCode;
import com.dayflow.api.common.ProblemResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * 401 for a missing, expired or invalid access token, as the same Problem Details body every other API error
 * uses (code UNAUTHORIZED). The token error itself is not described, so the client just refreshes once.
 */
@Component
public class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

    private final JsonMapper jsonMapper;

    public ProblemAuthenticationEntryPoint(JsonMapper jsonMapper) {
        this.jsonMapper = jsonMapper;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException exception) throws IOException {
        ErrorCode code = ErrorCode.UNAUTHORIZED;
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", code.title());
        body.put("status", code.status().value());
        body.put("detail", "Sign in to use the DayFlow API.");
        body.put("instance", request.getRequestURI());
        body.put("code", code.name());
        body.put("fieldErrors", List.of());
        body.put("traceId", UUID.randomUUID().toString());

        response.setStatus(code.status().value());
        response.setHeader(HttpHeaders.WWW_AUTHENTICATE, "Bearer");
        // JSON is UTF-8 by definition; the same media type as every other Problem Details response.
        response.setContentType(ProblemResponse.MEDIA_TYPE);
        response.getOutputStream().write(jsonMapper.writeValueAsString(body).getBytes(StandardCharsets.UTF_8));
    }
}
