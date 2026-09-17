package com.dayflow.api.common;

import com.dayflow.api.common.ApiException.FieldViolation;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Problem Details responses with code, fieldErrors and traceId (requirements §9.1).
 * Clients branch on {@code code}, not on the human-readable detail.
 */
@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> handleApiException(ApiException ex) {
        ResponseEntity<ProblemDetail> response = problem(ex.getCode(), ex.getMessage(), ex.getFieldErrors());
        if (ex.getRetryAfter() == null) {
            return response;
        }
        return ResponseEntity.status(response.getStatusCode())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(Math.max(ex.getRetryAfter().toSeconds(), 1)))
                .body(response.getBody());
    }

    /** A concurrent transaction changed the row between read and write. */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<ProblemDetail> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return problem(ErrorCode.VERSION_CONFLICT,
                "The resource was changed by another request. Reload and try again.", List.of());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> handleDataIntegrity(DataIntegrityViolationException ex) {
        log.warn("Data integrity violation", ex);
        return problem(ErrorCode.DATA_CONFLICT,
                "The request conflicts with the current data. Reload and try again.", List.of());
    }

    /** Adds code/fieldErrors/traceId to Spring MVC's standard errors (invalid body, bad parameter, ...). */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception ex, Object body, HttpHeaders headers, HttpStatusCode statusCode, WebRequest request) {
        ResponseEntity<Object> response = super.handleExceptionInternal(ex, body, headers, statusCode, request);
        if (response != null && response.getBody() instanceof ProblemDetail problem) {
            problem.setProperty("code",
                    statusCode.value() == 400 ? ErrorCode.VALIDATION_ERROR.name() : "HTTP_" + statusCode.value());
            problem.setProperty("fieldErrors", ex instanceof MethodArgumentNotValidException invalid
                    ? invalid.getBindingResult().getFieldErrors().stream()
                            .map(error -> new FieldViolation(error.getField(), error.getDefaultMessage()))
                            .toList()
                    : List.of());
            problem.setProperty("traceId", UUID.randomUUID().toString());
        }
        return response;
    }

    private static ResponseEntity<ProblemDetail> problem(
            ErrorCode code, String detail, List<FieldViolation> fieldErrors) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(code.status(), detail);
        problem.setTitle(code.title());
        problem.setProperty("code", code.name());
        problem.setProperty("fieldErrors", fieldErrors);
        problem.setProperty("traceId", UUID.randomUUID().toString());
        return ResponseEntity.status(code.status()).body(problem);
    }
}
