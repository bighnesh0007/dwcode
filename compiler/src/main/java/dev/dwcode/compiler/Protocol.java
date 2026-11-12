package dev.dwcode.compiler;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;

/** Wire types, shared by the HTTP API and the supervisor ⇄ worker pipe. */
public final class Protocol {
    private Protocol() {}

    public static final ObjectMapper JSON = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true)
            .setSerializationInclusion(JsonInclude.Include.NON_NULL);

    /** `value` is the input document as text, parsed by the engine using `mimeType`. */
    public record Input(String name, String value, String mimeType) {}

    public record ExecuteRequest(String script, List<Input> inputs, Long timeoutMs) {}

    /**
     * Why an execution did not produce output. The split matters downstream:
     * COMPILE/RUNTIME/FORBIDDEN/TIMEOUT/LIMIT are the user's result and may be
     * recorded as a verdict; OVERLOADED/UNAVAILABLE are ours and must never be
     * (docs/audit/09-runtime-ownership.md §5.1).
     */
    public enum ErrorKind { COMPILE, RUNTIME, FORBIDDEN, TIMEOUT, LIMIT, OVERLOADED, UNAVAILABLE, INVALID }

    public record Failure(ErrorKind kind, String message) {}

    public record ExecuteResult(boolean ok, String output, String mimeType, Failure error, Long timeMs) {
        public static ExecuteResult success(String output, String mimeType, long timeMs) {
            return new ExecuteResult(true, output, mimeType, null, timeMs);
        }

        public static ExecuteResult failure(ErrorKind kind, String message, long timeMs) {
            return new ExecuteResult(false, null, null, new Failure(kind, message), timeMs);
        }

        /** Infrastructure failures: the caller must not treat these as the user's result. */
        @JsonIgnore // derived, not data: serialised, it breaks strict parsing on the other side
        public boolean isInfrastructureFailure() {
            return error != null && (error.kind == ErrorKind.OVERLOADED || error.kind == ErrorKind.UNAVAILABLE);
        }
    }

    /** One line on a worker's stdin. */
    public record WorkerRequest(long id, String script, List<Input> inputs) {}

    /** One line on a worker's stdout. `id` 0 is the readiness signal. */
    public record WorkerResponse(long id, ExecuteResult result) {}
}
