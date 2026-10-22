package dev.dwcode.compiler;

import java.util.Map;

/**
 * Every setting, read and validated once at startup. Nothing else reads the
 * environment: a bad value fails the boot, not the thousandth request.
 */
public record Config(
        int port,
        String authToken,
        int workers,
        int queueCapacity,
        long queueWaitMs,
        long defaultTimeoutMs,
        long maxTimeoutMs,
        int workerHeapMb,
        int compileCacheSize,
        int maxScriptBytes,
        int maxInputBytes,
        int maxInputs,
        int maxOutputBytes) {

    public static Config fromEnv(Map<String, String> env) {
        int cores = Runtime.getRuntime().availableProcessors();
        Config c = new Config(
                integer(env, "PORT", 8080, 1, 65535),
                env.getOrDefault("COMPILER_AUTH_TOKEN", ""),
                // One worker per core: each runs one script at a time, so more
                // workers than cores only adds memory and context switches.
                integer(env, "COMPILER_WORKERS", Math.max(1, cores), 1, 64),
                integer(env, "COMPILER_QUEUE_CAPACITY", 64, 0, 10_000),
                integer(env, "COMPILER_QUEUE_WAIT_MS", 2_000, 0, 60_000),
                integer(env, "COMPILER_TIMEOUT_MS", 5_000, 100, 60_000),
                integer(env, "COMPILER_MAX_TIMEOUT_MS", 15_000, 100, 120_000),
                integer(env, "COMPILER_WORKER_HEAP_MB", 256, 64, 4_096),
                integer(env, "COMPILER_CACHE_SIZE", 512, 0, 100_000),
                integer(env, "COMPILER_MAX_SCRIPT_BYTES", 64 * 1024, 1_024, 1 << 20),
                integer(env, "COMPILER_MAX_INPUT_BYTES", 1 << 20, 1_024, 16 << 20),
                integer(env, "COMPILER_MAX_INPUTS", 16, 1, 64),
                integer(env, "COMPILER_MAX_OUTPUT_BYTES", 2 << 20, 1_024, 32 << 20));

        if (c.defaultTimeoutMs > c.maxTimeoutMs) {
            throw new IllegalArgumentException("COMPILER_TIMEOUT_MS must not exceed COMPILER_MAX_TIMEOUT_MS");
        }
        boolean production = "production".equals(env.get("NODE_ENV")) || "production".equals(env.get("APP_ENV"));
        if (production && c.authToken.length() < 32) {
            // The service runs untrusted code; in production it must never be
            // callable by anything except the API server.
            throw new IllegalArgumentException("COMPILER_AUTH_TOKEN must be at least 32 characters in production");
        }
        return c;
    }

    private static int integer(Map<String, String> env, String key, int fallback, int min, int max) {
        String raw = env.get(key);
        if (raw == null || raw.isBlank()) return fallback;
        int value;
        try {
            value = Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " must be an integer, got \"" + raw + "\"");
        }
        if (value < min || value > max) {
            throw new IllegalArgumentException(key + " must be between " + min + " and " + max + ", got " + value);
        }
        return value;
    }
}
