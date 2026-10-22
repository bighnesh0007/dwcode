package dev.dwcode.compiler;

import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import dev.dwcode.compiler.Protocol.WorkerRequest;
import dev.dwcode.compiler.Protocol.WorkerResponse;
import java.io.BufferedReader;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * A worker process: newline-delimited JSON requests on stdin, responses on
 * stdout, one at a time. Launched by WorkerPool with an empty environment.
 */
public final class WorkerMain {
    private WorkerMain() {}

    public static void main(String[] args) throws Exception {
        // stdout is the protocol channel. Anything else that prints — the
        // engine's log() function included — would corrupt it, so keep a private
        // handle on the real stdout and point System.out at stderr.
        PrintStream protocol = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);
        System.setOut(System.err);

        int cacheSize = Integer.parseInt(args[0]);
        int maxOutputBytes = Integer.parseInt(args[1]);
        Engine engine = new Engine(cacheSize, maxOutputBytes);
        warmUp(engine);

        send(protocol, new WorkerResponse(0, null)); // ready

        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            WorkerRequest req = Protocol.JSON.readValue(line, WorkerRequest.class);
            ExecuteResult result = engine.execute(req.script(), req.inputs());
            send(protocol, new WorkerResponse(req.id(), result));
        }
        // stdin closed: the supervisor is gone or retiring us.
    }

    /**
     * The first compile in a fresh JVM takes ~1.2s against ~3ms warm (measured,
     * 2.12.2). Paying that here, before announcing readiness, keeps it off the
     * first user's request.
     */
    private static void warmUp(Engine engine) {
        List<Input> in = List.of(new Input("payload", "{\"items\":[3,1,2],\"name\":\"warm\"}", "application/json"));
        String[] scripts = {
            "%dw 2.0\noutput application/json\n---\npayload.items map ($ * 2) orderBy $",
            "%dw 2.0\noutput application/json\nimport * from dw::core::Strings\n---\n{ n: capitalize(payload.name), s: sum(payload.items) }",
            "%dw 2.0\noutput application/xml\n---\nroot: { (payload.items map { item: $ }) }",
            "%dw 2.0\noutput application/csv\n---\npayload.items map { v: $ }",
        };
        for (int round = 0; round < 20; round++) {
            for (String s : scripts) engine.execute(s + "\n// " + round, in);
        }
    }

    private static void send(PrintStream out, WorkerResponse response) throws Exception {
        out.print(Protocol.JSON.writeValueAsString(response));
        out.print('\n');
        out.flush();
    }
}
