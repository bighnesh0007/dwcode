package dev.dwcode.compiler;

import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import java.util.EnumMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/** Prometheus text exposition, hand-rolled: a client library is more code than this. */
public final class Metrics {
    /** Upper bounds in ms. Chosen around the measured costs (0.2ms run, 3ms compile) and the 1s p95 target. */
    private static final long[] BUCKETS_MS = {1, 2, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 15_000};

    private final LongAdder ok = new LongAdder();
    private final Map<ErrorKind, LongAdder> failures = new EnumMap<>(ErrorKind.class);
    private final LongAdder rejected = new LongAdder();
    private final LongAdder timeouts = new LongAdder();
    private final LongAdder workerRestarts = new LongAdder();
    private final AtomicLong[] buckets = new AtomicLong[BUCKETS_MS.length + 1];
    private final LongAdder durationSumMs = new LongAdder();
    private final LongAdder durationCount = new LongAdder();

    public Metrics() {
        for (ErrorKind k : ErrorKind.values()) failures.put(k, new LongAdder());
        for (int i = 0; i < buckets.length; i++) buckets[i] = new AtomicLong();
    }

    public void record(ExecuteResult r, long wallMs) {
        if (r.ok()) ok.increment();
        else failures.get(r.error().kind()).increment();
        int i = 0;
        while (i < BUCKETS_MS.length && wallMs > BUCKETS_MS[i]) i++;
        buckets[i].incrementAndGet();
        durationSumMs.add(wallMs);
        durationCount.increment();
    }

    public void rejected() {
        rejected.increment();
    }

    public void timeout() {
        timeouts.increment();
    }

    public void workerRestart() {
        workerRestarts.increment();
    }

    public String render(WorkerPool pool) {
        StringBuilder b = new StringBuilder(2048);
        b.append("# TYPE dwc_executions_total counter\n");
        b.append("dwc_executions_total{outcome=\"ok\"} ").append(ok.sum()).append('\n');
        failures.forEach((k, v) -> b.append("dwc_executions_total{outcome=\"")
                .append(k.name().toLowerCase()).append("\"} ").append(v.sum()).append('\n'));
        b.append("# TYPE dwc_rejected_total counter\ndwc_rejected_total ").append(rejected.sum()).append('\n');
        b.append("# TYPE dwc_timeouts_total counter\ndwc_timeouts_total ").append(timeouts.sum()).append('\n');
        b.append("# TYPE dwc_worker_restarts_total counter\ndwc_worker_restarts_total ").append(workerRestarts.sum()).append('\n');
        b.append("# TYPE dwc_workers gauge\n");
        b.append("dwc_workers{state=\"live\"} ").append(pool.liveWorkers()).append('\n');
        b.append("dwc_workers{state=\"idle\"} ").append(pool.idleWorkers()).append('\n');
        b.append("# TYPE dwc_waiting_callers gauge\ndwc_waiting_callers ").append(pool.waitingCallers()).append('\n');
        b.append("# TYPE dwc_execution_ms histogram\n");
        long cumulative = 0;
        for (int i = 0; i < BUCKETS_MS.length; i++) {
            cumulative += buckets[i].get();
            b.append("dwc_execution_ms_bucket{le=\"").append(BUCKETS_MS[i]).append("\"} ").append(cumulative).append('\n');
        }
        cumulative += buckets[BUCKETS_MS.length].get();
        b.append("dwc_execution_ms_bucket{le=\"+Inf\"} ").append(cumulative).append('\n');
        b.append("dwc_execution_ms_sum ").append(durationSumMs.sum()).append('\n');
        b.append("dwc_execution_ms_count ").append(durationCount.sum()).append('\n');
        return b.toString();
    }
}
