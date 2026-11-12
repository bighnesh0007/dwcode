package dev.dwcode.compiler;

import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.mule.weave.v2.model.ServiceManager;
import org.mule.weave.v2.model.service.DefaultSecurityManagerService;
import org.mule.weave.v2.model.service.SecurityManagerService;
import org.mule.weave.v2.model.service.WeaveRuntimePrivilege;
import org.mule.weave.v2.runtime.DataWeaveResult;
import org.mule.weave.v2.runtime.DataWeaveScript;
import org.mule.weave.v2.runtime.DataWeaveScriptingEngine;
import org.mule.weave.v2.runtime.ScriptingBindings;

/**
 * The DataWeave engine, locked down. Runs inside a worker process only: it
 * enforces privileges but cannot enforce time, which is why the supervisor
 * kills workers instead (see WorkerPool).
 *
 * Not thread-safe by design: a worker executes one script at a time.
 */
public final class Engine {

    /**
     * No privileges at all. Verified against 2.12.2: with the default service
     * manager a script can readUrl("file:///…"), readUrl("http://…") (SSRF) and
     * dw::System::envVar. With this one each fails with SecurityPrivilegeViolation,
     * while the standard library, now(), uuid() and log() keep working.
     */
    private static final ServiceManager LOCKED_DOWN = lockedDown();

    private final DataWeaveScriptingEngine engine = DataWeaveScriptingEngine.apply();
    private final Map<String, DataWeaveScript> cache;
    private final int maxOutputBytes;

    public Engine(int cacheSize, int maxOutputBytes) {
        this.maxOutputBytes = maxOutputBytes;
        // Access-ordered LinkedHashMap = LRU. Compiling costs ~3ms warm against
        // ~0.2ms to run, so repeat scripts (live compile, grading N cases) are
        // where the time goes.
        this.cache = new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, DataWeaveScript> eldest) {
                return size() > cacheSize;
            }
        };
    }

    public ExecuteResult execute(String script, List<Input> inputs) {
        long start = System.nanoTime();
        String[] names = inputs.stream().map(Input::name).toArray(String[]::new);

        DataWeaveScript compiled;
        try {
            compiled = compile(script, names);
        } catch (Throwable t) {
            return ExecuteResult.failure(classify(t, ErrorKind.COMPILE), message(t), elapsedMs(start));
        }

        try {
            ScriptingBindings bindings = new ScriptingBindings();
            for (Input in : inputs) {
                bindings.addBinding(in.name(), in.value().getBytes(StandardCharsets.UTF_8), in.mimeType());
            }
            DataWeaveResult result = compiled.write(bindings, LOCKED_DOWN);
            String output = result.getContentAsString();
            if (output.length() > maxOutputBytes) {
                return ExecuteResult.failure(ErrorKind.LIMIT,
                        "Output exceeds the " + (maxOutputBytes / 1024) + " KB limit.", elapsedMs(start));
            }
            return ExecuteResult.success(output, result.getMimeType(), elapsedMs(start));
        } catch (StackOverflowError e) {
            return ExecuteResult.failure(ErrorKind.LIMIT, "Stack overflow: recursion is too deep.", elapsedMs(start));
        } catch (Throwable t) {
            if (t instanceof OutOfMemoryError oom) throw oom; // let -XX:+ExitOnOutOfMemoryError end the worker
            return ExecuteResult.failure(classify(t, ErrorKind.RUNTIME), message(t), elapsedMs(start));
        }
    }

    private DataWeaveScript compile(String script, String[] inputNames) {
        String key = cacheKey(script, inputNames);
        DataWeaveScript hit = cache.get(key);
        if (hit != null) return hit;
        DataWeaveScript compiled = engine.compile(script, inputNames);
        cache.put(key, compiled);
        return compiled;
    }

    /** Exception class names, not types: these are engine internals that move between versions. */
    private static ErrorKind classify(Throwable t, ErrorKind fallback) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            String name = c.getClass().getSimpleName();
            if (name.contains("SecurityPrivilegeViolation")) return ErrorKind.FORBIDDEN;
            if (name.contains("StackOverflow")) return ErrorKind.LIMIT;
            if (name.contains("CompilationException") || name.contains("ParseException")) return ErrorKind.COMPILE;
        }
        return fallback;
    }

    private static String message(Throwable t) {
        String m = t.getMessage();
        return m == null || m.isBlank() ? t.getClass().getSimpleName() : m;
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }

    private static String cacheKey(String script, String[] names) {
        try {
            MessageDigest d = MessageDigest.getInstance("SHA-256");
            d.update(script.getBytes(StandardCharsets.UTF_8));
            for (String n : names) {
                d.update((byte) 0);
                d.update(n.getBytes(StandardCharsets.UTF_8));
            }
            return HexFormat.of().formatHex(d.digest());
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e); // SHA-256 is mandatory in every JRE
        }
    }

    private static ServiceManager lockedDown() {
        scala.collection.immutable.Map<Class<?>, Object> services = scala.collection.immutable.Map$.MODULE$.empty();
        services = services.updated(SecurityManagerService.class,
                new DefaultSecurityManagerService(new WeaveRuntimePrivilege[0]));
        return ServiceManager.apply(services);
    }
}
