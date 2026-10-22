package dev.dwcode.compiler;

import java.util.logging.Logger;

/**
 *   java -jar dwcode-compiler.jar            the HTTP supervisor (default)
 *   java -cp … dev.dwcode.compiler.WorkerMain  a worker, launched by the supervisor
 */
public final class Main {
    private static final Logger LOG = Logger.getLogger(Main.class.getName());

    private Main() {}

    public static void main(String[] args) throws Exception {
        Config config;
        try {
            config = Config.fromEnv(System.getenv());
        } catch (IllegalArgumentException e) {
            System.err.println("invalid configuration: " + e.getMessage());
            System.exit(2);
            return;
        }

        Metrics metrics = new Metrics();
        WorkerPool pool = new WorkerPool(config, metrics);
        long t0 = System.nanoTime();
        pool.start();
        LOG.info("warmed " + pool.liveWorkers() + " workers in " + (System.nanoTime() - t0) / 1_000_000 + " ms");

        HttpApi api = new HttpApi(config, pool, metrics);
        api.start();

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            api.stop();
            pool.close();
        }, "shutdown"));
    }
}
