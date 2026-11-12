package dev.dwcode.compiler;

import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import dev.dwcode.compiler.Protocol.WorkerRequest;
import java.io.IOException;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingDeque;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Logger;

/**
 * A fixed set of warm worker processes, one script each at a time.
 *
 * Why processes and not threads: the engine does not stop on interrupt. Measured
 * on 2.12.2, a cancelled runaway script kept its thread busy past 13s, and the
 * engine's own max-time hooks did not fire. A thread pool would let one hostile
 * script per thread take the service down; killing a process always works.
 *
 * Admission control is the spike guard: at most `queueCapacity` callers wait, for
 * at most `queueWaitMs`. Past that the caller gets OVERLOADED at once — a fast,
 * honest 503 instead of a pile-up that times everyone out.
 */
public final class WorkerPool implements AutoCloseable {
    private static final Logger LOG = Logger.getLogger(WorkerPool.class.getName());
    private static final long SPAWN_READY_TIMEOUT_MS = 60_000;

    private final Config config;
    private final List<String> command;
    private final Metrics metrics;
    private final LinkedBlockingDeque<WorkerProcess> idle = new LinkedBlockingDeque<>();
    private final AtomicInteger live = new AtomicInteger();
    private final AtomicInteger waiting = new AtomicInteger();
    private final ExecutorService spawner = Executors.newVirtualThreadPerTaskExecutor();
    private volatile boolean closed;

    public WorkerPool(Config config, Metrics metrics) {
        this.config = config;
        this.metrics = metrics;
        this.command = workerCommand(config);
    }

    /** Blocks until every worker is warm. Readiness must mean "can serve now". */
    public void start() throws Exception {
        List<java.util.concurrent.Future<?>> started = new ArrayList<>();
        for (int i = 0; i < config.workers(); i++) started.add(spawner.submit(this::spawnOne));
        for (var f : started) f.get(SPAWN_READY_TIMEOUT_MS, TimeUnit.MILLISECONDS);
        if (live.get() == 0) throw new IllegalStateException("no worker could be started");
    }

    public ExecuteResult execute(String script, List<Input> inputs, long timeoutMs) {
        if (waiting.incrementAndGet() > config.queueCapacity() + idle.size()) {
            waiting.decrementAndGet();
            metrics.rejected();
            return ExecuteResult.failure(ErrorKind.OVERLOADED, "The compiler is at capacity. Retry shortly.", 0);
        }
        WorkerProcess worker;
        try {
            worker = idle.pollFirst(config.queueWaitMs(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ExecuteResult.failure(ErrorKind.UNAVAILABLE, "Interrupted.", 0);
        } finally {
            waiting.decrementAndGet();
        }
        if (worker == null) {
            metrics.rejected();
            return ExecuteResult.failure(ErrorKind.OVERLOADED, "The compiler is at capacity. Retry shortly.", 0);
        }
        return runOn(worker, new WorkerRequest(0, script, inputs), timeoutMs, true);
    }

    private ExecuteResult runOn(WorkerProcess worker, WorkerRequest req, long timeoutMs, boolean mayRetry) {
        long start = System.nanoTime();
        try {
            ExecuteResult result = worker.execute(req, timeoutMs);
            release(worker);
            return result;
        } catch (TimeoutException e) {
            retire(worker, "timeout");
            metrics.timeout();
            return ExecuteResult.failure(ErrorKind.TIMEOUT,
                    "Execution exceeded the " + timeoutMs + " ms time limit.", elapsedMs(start));
        } catch (WorkerProcess.WorkerDiedException died) {
            retire(worker, "exit " + died.exitCode);
            if (died.exitCode == WorkerProcess.EXIT_OUT_OF_MEMORY) {
                // The script exhausted the worker heap. Deterministic: retrying
                // would just kill a second worker.
                return ExecuteResult.failure(ErrorKind.LIMIT, "Execution exceeded the memory limit.", elapsedMs(start));
            }
            if (mayRetry) {
                // Compiles are pure functions of (script, inputs), so one retry on
                // a fresh worker is safe. Only one: a script that crashes workers
                // must not be able to crash all of them.
                WorkerProcess next = idle.pollFirst();
                if (next != null) return runOn(next, req, timeoutMs, false);
            }
            return ExecuteResult.failure(ErrorKind.UNAVAILABLE, "The compiler worker failed. Retry shortly.", elapsedMs(start));
        } catch (IOException e) {
            retire(worker, "io " + e.getMessage());
            return ExecuteResult.failure(ErrorKind.UNAVAILABLE, "The compiler worker failed. Retry shortly.", elapsedMs(start));
        }
    }

    private void release(WorkerProcess worker) {
        if (closed || !worker.isAlive()) {
            retire(worker, "dead on release");
            return;
        }
        idle.offerFirst(worker); // LIFO: the hottest worker (warmest caches) serves next
    }

    private void retire(WorkerProcess worker, String reason) {
        worker.kill();
        live.decrementAndGet();
        metrics.workerRestart();
        LOG.warning(() -> "retiring worker " + worker.pid() + ": " + reason);
        if (!closed) spawner.submit(this::spawnWithBackoff);
    }

    private void spawnWithBackoff() {
        long delay = 250;
        while (!closed) {
            try {
                spawnOne();
                return;
            } catch (Exception e) {
                LOG.severe("worker spawn failed: " + e);
                sleep(delay);
                delay = Math.min(delay * 2, 10_000);
            }
        }
    }

    private Void spawnOne() throws Exception {
        WorkerProcess w = WorkerProcess.spawn(command);
        try {
            w.awaitReady(SPAWN_READY_TIMEOUT_MS);
        } catch (Exception e) {
            w.kill();
            throw e;
        }
        live.incrementAndGet();
        idle.offerLast(w);
        return null;
    }

    public int liveWorkers() {
        return live.get();
    }

    public int idleWorkers() {
        return idle.size();
    }

    public int waitingCallers() {
        return waiting.get();
    }

    @Override
    public void close() {
        closed = true;
        WorkerProcess w;
        while ((w = idle.poll()) != null) w.kill();
        spawner.shutdownNow();
    }

    private static List<String> workerCommand(Config c) {
        String java = ProcessHandle.current().info().command()
                .orElse(Path.of(System.getProperty("java.home"), "bin", "java").toString());
        return List.of(
                java,
                "-Xmx" + c.workerHeapMb() + "m",
                "-Xss4m", // the engine caps recursion at 256 frames; this is headroom for its own frames
                "-XX:+UseSerialGC", // one thread per worker: parallel GC only adds threads and memory
                "-XX:+ExitOnOutOfMemoryError",
                "-Dfile.encoding=UTF-8",
                "-Djava.awt.headless=true",
                "-cp", System.getProperty("java.class.path"),
                WorkerMain.class.getName(),
                Integer.toString(c.compileCacheSize()),
                Integer.toString(c.maxOutputBytes()));
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
