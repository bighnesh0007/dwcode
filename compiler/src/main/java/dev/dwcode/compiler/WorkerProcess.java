package dev.dwcode.compiler;

import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.WorkerRequest;
import dev.dwcode.compiler.Protocol.WorkerResponse;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** One worker JVM and the pipe to it. Used by one request at a time. */
final class WorkerProcess {

    /** The JVM exits with 3 under -XX:+ExitOnOutOfMemoryError. */
    static final int EXIT_OUT_OF_MEMORY = 3;

    static final class WorkerDiedException extends Exception {
        final int exitCode;

        WorkerDiedException(int exitCode) {
            super("worker exited with code " + exitCode);
            this.exitCode = exitCode;
        }
    }

    private final Process process;
    private final OutputStream stdin;
    private final CompletableFuture<Void> ready = new CompletableFuture<>();
    private volatile CompletableFuture<ExecuteResult> pending;
    private long nextId = 1;

    private WorkerProcess(Process process) {
        this.process = process;
        this.stdin = process.getOutputStream();
        Thread reader = Thread.ofPlatform().daemon().name("worker-reader-" + process.pid()).start(this::readLoop);
        reader.setUncaughtExceptionHandler((t, e) -> ready.completeExceptionally(e));
    }

    static WorkerProcess spawn(List<String> command) throws IOException {
        ProcessBuilder pb = new ProcessBuilder(command);
        // Defence in depth behind the engine's ENVIRONMENT privilege: even a
        // bypass finds nothing to read. The supervisor's auth token stays put.
        pb.environment().clear();
        // stderr carries the user's log() output. Discard it rather than mix
        // untrusted text into the service log.
        pb.redirectError(ProcessBuilder.Redirect.DISCARD);
        return new WorkerProcess(pb.start());
    }

    void awaitReady(long timeoutMs) throws Exception {
        ready.get(timeoutMs, TimeUnit.MILLISECONDS);
    }

    /**
     * @throws TimeoutException the script overran; the caller must kill this worker
     * @throws WorkerDiedException the process exited mid-request
     */
    ExecuteResult execute(WorkerRequest template, long timeoutMs) throws TimeoutException, WorkerDiedException, IOException {
        long id = nextId++;
        CompletableFuture<ExecuteResult> future = new CompletableFuture<>();
        pending = future;
        byte[] line = (Protocol.JSON.writeValueAsString(new WorkerRequest(id, template.script(), template.inputs())) + "\n")
                .getBytes(StandardCharsets.UTF_8);
        try {
            stdin.write(line);
            stdin.flush();
        } catch (IOException e) {
            throw new WorkerDiedException(exitCodeOrMinusOne());
        }
        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof WorkerDiedException died) throw died;
            throw new IOException(e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException(e);
        } finally {
            pending = null;
        }
    }

    boolean isAlive() {
        return process.isAlive();
    }

    long pid() {
        return process.pid();
    }

    /** SIGKILL. The only reliable stop for a runaway script: the engine ignores interrupts. */
    void kill() {
        process.destroyForcibly();
    }

    private void readLoop() {
        try (BufferedReader out = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = out.readLine()) != null) {
                WorkerResponse r = Protocol.JSON.readValue(line, WorkerResponse.class);
                if (r.id() == 0) {
                    ready.complete(null);
                    continue;
                }
                CompletableFuture<ExecuteResult> p = pending;
                if (p != null) p.complete(r.result());
            }
        } catch (IOException ignored) {
            // Pipe closed: handled below as a death.
        }
        int code = waitForExit();
        WorkerDiedException died = new WorkerDiedException(code);
        ready.completeExceptionally(died);
        CompletableFuture<ExecuteResult> p = pending;
        if (p != null) p.completeExceptionally(died);
    }

    private int waitForExit() {
        try {
            return process.waitFor();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return -1;
        }
    }

    private int exitCodeOrMinusOne() {
        try {
            return process.waitFor(200, TimeUnit.MILLISECONDS) ? process.exitValue() : -1;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return -1;
        }
    }
}
