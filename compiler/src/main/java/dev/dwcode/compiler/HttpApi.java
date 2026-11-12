package dev.dwcode.compiler;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteRequest;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.logging.Logger;
import java.util.regex.Pattern;

/**
 * The service's only door. The JDK's built-in server on virtual threads: the
 * work happens in worker processes, so this layer only parses, validates and
 * waits — no framework earns its dependency weight here.
 *
 *   POST /v1/execute   run a script (bearer token)
 *   GET  /health       liveness: static, does no work
 *   GET  /ready        readiness: at least one warm worker
 *   GET  /metrics      Prometheus text
 */
public final class HttpApi {
    private static final Logger LOG = Logger.getLogger(HttpApi.class.getName());
    private static final Pattern INPUT_NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,63}");
    /**
     * Input formats the bundled modules can read. Deliberately NOT application/java:
     * that is the engine's Java-object bridge, and untrusted input has no business
     * near it. Anything else is refused here with a clear message rather than
     * failing inside the engine with a worse one.
     */
    private static final Set<String> MIME_TYPES = Set.of(
            "application/json", "application/xml", "application/csv", "text/plain",
            "application/yaml", "application/x-ndjson");

    private final Config config;
    private final WorkerPool pool;
    private final Metrics metrics;
    private final byte[] token;
    private HttpServer server;

    public HttpApi(Config config, WorkerPool pool, Metrics metrics) {
        this.config = config;
        this.pool = pool;
        this.metrics = metrics;
        this.token = config.authToken().getBytes(StandardCharsets.UTF_8);
    }

    public void start() throws IOException {
        // TCP_NODELAY. The JDK server writes headers and body separately; with
        // Nagle on, the body waits for the client's delayed ACK, adding a fixed
        // ~40ms to every response (measured: p50 44ms with it, see load test).
        System.setProperty("sun.net.httpserver.nodelay", "true");
        server = HttpServer.create(new InetSocketAddress(config.host(), config.port()), 512);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/v1/execute", this::execute);
        server.createContext("/health", ex -> send(ex, 200, "text/plain", "ok"));
        server.createContext("/ready", ex -> {
            int live = pool.liveWorkers();
            send(ex, live > 0 ? 200 : 503, "text/plain", live > 0 ? "ready " + live : "no live workers");
        });
        server.createContext("/metrics", ex -> send(ex, 200, "text/plain; version=0.0.4", metrics.render(pool)));
        server.start();
        if (token.length == 0) LOG.warning("COMPILER_AUTH_TOKEN is empty: /v1/execute accepts unauthenticated calls (dev only)");
        LOG.info("compiler listening on " + config.host() + ":" + config.port() + " with " + pool.liveWorkers() + " workers");
    }

    public void stop() {
        if (server != null) server.stop(2);
    }

    private void execute(HttpExchange ex) throws IOException {
        try (ex) {
            if (!"POST".equals(ex.getRequestMethod())) {
                ex.getResponseHeaders().set("Allow", "POST");
                send(ex, 405, "text/plain", "method not allowed");
                return;
            }
            if (!authorised(ex)) {
                send(ex, 401, "application/json", "{\"ok\":false,\"error\":{\"kind\":\"UNAUTHORIZED\",\"message\":\"missing or bad token\"}}");
                return;
            }

            // JSON escaping can roughly double text, so read up to twice the
            // decoded budget and check the real sizes after parsing.
            long bodyLimit = 2L * (config.maxScriptBytes() + config.maxInputBytes()) + 64 * 1024;
            byte[] body = readLimited(ex.getRequestBody(), bodyLimit);
            if (body == null) {
                reply(ex, 413, ExecuteResult.failure(ErrorKind.LIMIT, "Request body is too large.", 0));
                return;
            }

            ExecuteRequest req;
            try {
                req = Protocol.JSON.readValue(body, ExecuteRequest.class);
            } catch (JsonProcessingException e) {
                reply(ex, 400, ExecuteResult.failure(ErrorKind.INVALID, "Body is not a valid execute request.", 0));
                return;
            }
            List<Input> inputs = new ArrayList<>();
            String problem = validate(req, inputs);
            if (problem != null) {
                reply(ex, 400, ExecuteResult.failure(ErrorKind.INVALID, problem, 0));
                return;
            }

            long timeout = req.timeoutMs() == null
                    ? config.defaultTimeoutMs()
                    : Math.min(Math.max(req.timeoutMs(), 100), config.maxTimeoutMs());

            long start = System.nanoTime();
            ExecuteResult result = pool.execute(req.script(), inputs, timeout);
            long wallMs = (System.nanoTime() - start) / 1_000_000;
            metrics.record(result, wallMs);

            if (result.isInfrastructureFailure()) {
                ex.getResponseHeaders().set("Retry-After", result.error().kind() == ErrorKind.OVERLOADED ? "1" : "2");
                reply(ex, 503, result);
            } else {
                // A user's compile error, timeout or limit is a successful call
                // with a failed result. 200, so callers never confuse it with ours.
                reply(ex, 200, result);
            }
        } catch (Exception e) {
            LOG.severe("execute failed: " + e);
            try {
                reply(ex, 500, ExecuteResult.failure(ErrorKind.UNAVAILABLE, "Internal error.", 0));
            } catch (IOException ignored) {
                // response already started
            }
        }
    }

    /** @return null when valid; otherwise a message safe to show the caller. Fills {@code out}. */
    private String validate(ExecuteRequest req, List<Input> out) {
        if (req.script() == null || req.script().isBlank()) return "`script` is required.";
        if (utf8Length(req.script()) > config.maxScriptBytes()) return "`script` exceeds " + config.maxScriptBytes() + " bytes.";
        List<Input> in = req.inputs() == null ? List.of() : req.inputs();
        if (in.size() > config.maxInputs()) return "At most " + config.maxInputs() + " inputs are allowed.";
        Set<String> names = new HashSet<>();
        long total = 0;
        for (Input i : in) {
            if (i == null || i.name() == null || !INPUT_NAME.matcher(i.name()).matches()) {
                return "Each input needs a `name` that is a valid identifier.";
            }
            if (!names.add(i.name())) return "Duplicate input name `" + i.name() + "`.";
            if (i.value() == null) return "Input `" + i.name() + "` needs a string `value`.";
            String mime = i.mimeType() == null || i.mimeType().isBlank() ? "application/json" : i.mimeType();
            if (!MIME_TYPES.contains(mime)) return "Input `" + i.name() + "` has an unsupported mimeType `" + mime + "`.";
            total += utf8Length(i.value());
            out.add(new Input(i.name(), i.value(), mime));
        }
        if (total > config.maxInputBytes()) return "Inputs exceed " + config.maxInputBytes() + " bytes in total.";
        return null;
    }

    private boolean authorised(HttpExchange ex) {
        if (token.length == 0) return true;
        String header = ex.getRequestHeaders().getFirst("Authorization");
        if (header == null || !header.startsWith("Bearer ")) return false;
        // Constant-time: a timing difference would leak the token byte by byte.
        return MessageDigest.isEqual(token, header.substring(7).getBytes(StandardCharsets.UTF_8));
    }

    private static byte[] readLimited(InputStream in, long limit) throws IOException {
        byte[] data = in.readNBytes((int) Math.min(Integer.MAX_VALUE - 8, limit + 1));
        return data.length > limit ? null : data;
    }

    private static long utf8Length(String s) {
        return s.getBytes(StandardCharsets.UTF_8).length;
    }

    private static void reply(HttpExchange ex, int status, ExecuteResult result) throws IOException {
        send(ex, status, "application/json", Protocol.JSON.writeValueAsString(result));
    }

    private static void send(HttpExchange ex, int status, String contentType, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().set("Content-Type", contentType);
        ex.getResponseHeaders().set("Cache-Control", "no-store");
        ex.sendResponseHeaders(status, bytes.length);
        ex.getResponseBody().write(bytes);
        ex.close();
    }
}
