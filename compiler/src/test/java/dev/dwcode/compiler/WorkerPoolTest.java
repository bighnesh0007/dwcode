package dev.dwcode.compiler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Spawns real worker JVMs: the properties under test only exist across a process boundary. */
class WorkerPoolTest {
    static final String HEADER = "%dw 2.0\noutput application/json\n---\n";
    static final List<Input> EMPTY = List.of(new Input("payload", "{}", "application/json"));
    /** ~15s of CPU on 2.12.2 — far past every timeout below. */
    static final String RUNAWAY = HEADER + "sizeOf((1 to 300000000) map $ * 2)";

    static WorkerPool pool;

    @BeforeAll
    static void startPool() throws Exception {
        Config config = Config.fromEnv(Map.of(
                "COMPILER_WORKERS", "2",
                "COMPILER_WORKER_HEAP_MB", "128",
                "COMPILER_QUEUE_CAPACITY", "1",
                "COMPILER_QUEUE_WAIT_MS", "300"));
        pool = new WorkerPool(config, new Metrics());
        pool.start();
    }

    @AfterAll
    static void stopPool() {
        pool.close();
    }

    @Test
    void executesInAWorker() {
        ExecuteResult r = pool.execute(HEADER + "payload.a + 1", List.of(new Input("payload", "{\"a\":41}", "application/json")), 5_000);
        assertTrue(r.ok(), () -> String.valueOf(r.error()));
        assertEquals("42", r.output().trim());
    }

    @Test
    void killsARunawayScriptAndRecovers() throws Exception {
        long t = System.nanoTime();
        ExecuteResult r = pool.execute(RUNAWAY, EMPTY, 500);
        long ms = (System.nanoTime() - t) / 1_000_000;
        assertEquals(ErrorKind.TIMEOUT, r.error().kind());
        assertTrue(ms < 2_000, "timeout took " + ms + " ms");
        awaitLiveWorkers(2);
        assertTrue(pool.execute(HEADER + "1", EMPTY, 5_000).ok(), "pool must serve after replacing the killed worker");
    }

    @Test
    void containsMemoryExhaustionToOneWorker() throws Exception {
        // orderBy must hold every element at once (a plain map streams lazily and
        // never exceeds the heap), so this exhausts a 128 MB worker.
        ExecuteResult r = pool.execute(HEADER + "sizeOf(((1 to 5000000) map { v: $, s: $ as String }) orderBy -$.v)", EMPTY, 14_000);
        assertTrue(r.error() != null && r.error().kind() == ErrorKind.LIMIT, () -> "expected LIMIT, got " + r);
        awaitLiveWorkers(2);
        assertTrue(pool.execute(HEADER + "1", EMPTY, 5_000).ok());
    }

    @Test
    void shedsLoadInsteadOfQueueingForever() throws Exception {
        awaitLiveWorkers(2);
        ExecutorService ex = Executors.newFixedThreadPool(6);
        try {
            List<Callable<ExecuteResult>> calls = new ArrayList<>();
            for (int i = 0; i < 6; i++) calls.add(() -> pool.execute(RUNAWAY, EMPTY, 1_500));
            List<ExecuteResult> results = new ArrayList<>();
            for (Future<ExecuteResult> f : ex.invokeAll(calls)) results.add(f.get());
            long overloaded = results.stream().filter(r -> r.error() != null && r.error().kind() == ErrorKind.OVERLOADED).count();
            long timedOut = results.stream().filter(r -> r.error() != null && r.error().kind() == ErrorKind.TIMEOUT).count();
            // 2 workers busy, at most 1 waiter admitted: the rest must be refused promptly.
            assertTrue(overloaded >= 3, "overloaded=" + overloaded + " timedOut=" + timedOut);
            assertTrue(results.stream().allMatch(r -> r.error() != null), "runaway scripts cannot succeed");
            assertTrue(overloaded > 0 && results.stream().filter(ExecuteResult::isInfrastructureFailure).count() == overloaded);
        } finally {
            ex.shutdownNow();
        }
        awaitLiveWorkers(2);
    }

    static void awaitLiveWorkers(int n) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 30_000;
        while (pool.liveWorkers() < n || pool.idleWorkers() < n) {
            if (System.currentTimeMillis() > deadline) {
                throw new AssertionError("pool did not recover: live=" + pool.liveWorkers() + " idle=" + pool.idleWorkers());
            }
            Thread.sleep(50);
        }
    }
}
