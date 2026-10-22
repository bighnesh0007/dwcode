package dev.dwcode.compiler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.dwcode.compiler.Protocol.ErrorKind;
import dev.dwcode.compiler.Protocol.ExecuteResult;
import dev.dwcode.compiler.Protocol.Input;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class EngineTest {
    private final Engine engine = new Engine(16, 4096);

    private ExecuteResult run(String body, String payload) {
        return engine.execute("%dw 2.0\noutput application/json\n---\n" + body,
                List.of(new Input("payload", payload, "application/json")));
    }

    private static String compact(String s) {
        return s.replaceAll("\\s+", "");
    }

    @Test
    void runsAScriptAgainstItsInput() {
        ExecuteResult r = run("payload.items map ($ * 2)", "{\"items\":[1,2,3]}");
        assertTrue(r.ok(), () -> String.valueOf(r.error()));
        assertEquals("[2,4,6]", compact(r.output()));
        assertEquals("application/json", r.mimeType());
    }

    @Test
    void bindsSeveralNamedInputs() {
        ExecuteResult r = engine.execute("%dw 2.0\noutput application/json\n---\n{ a: a.x, b: b.y }",
                List.of(new Input("a", "{\"x\":1}", "application/json"), new Input("b", "{\"y\":2}", "application/json")));
        assertEquals("{\"a\":1,\"b\":2}", compact(r.output()));
    }

    @Test
    void readsYamlAndNdjsonInputs() {
        ExecuteResult yaml = engine.execute("%dw 2.0\noutput application/json\n---\npayload.items",
                List.of(new Input("payload", "items:\n  - 1\n  - 2\n", "application/yaml")));
        assertTrue(yaml.ok(), () -> String.valueOf(yaml.error()));
        assertEquals("[1,2]", compact(yaml.output()));

        ExecuteResult nd = engine.execute("%dw 2.0\noutput application/json\n---\npayload map $.a",
                List.of(new Input("payload", "{\"a\":1}\n{\"a\":2}\n", "application/x-ndjson")));
        assertTrue(nd.ok(), () -> String.valueOf(nd.error()));
        assertEquals("[1,2]", compact(nd.output()));
    }

    @Test
    void supportsThenWhichTheOldUpstreamLacked() {
        assertEquals("3", compact(run("payload then sizeOf($)", "[1,2,3]").output()));
    }

    /** Each of these succeeded under the engine's default service manager (verified on 2.12.2). */
    @ParameterizedTest
    @ValueSource(strings = {
        "readUrl(\"file:///etc/hostname\", \"text/plain\")",
        "readUrl(\"http://127.0.0.1:1/\", \"text/plain\")",
        "readUrl(\"classpath://META-INF/MANIFEST.MF\", \"text/plain\")",
        "dw::System::envVar(\"HOME\")",
        "dw::System::envVars()",
    })
    void deniesFileNetworkAndEnvironmentAccess(String body) {
        ExecuteResult r = run(body, "{}");
        assertFalse(r.ok(), "must be denied: " + body);
        assertEquals(ErrorKind.FORBIDDEN, r.error().kind(), r.error().message());
    }

    @Test
    void reportsCompileErrorsAsTheUsersResult() {
        ExecuteResult r = run("payload map (", "[]");
        assertEquals(ErrorKind.COMPILE, r.error().kind());
        assertFalse(r.isInfrastructureFailure());
    }

    @Test
    void reportsRuntimeErrors() {
        ExecuteResult r = run("payload map ($ * 2)", "{\"not\":\"an array\"}");
        assertEquals(ErrorKind.RUNTIME, r.error().kind());
    }

    @Test
    void capsRecursion() {
        ExecuteResult r = run("do { fun f(n) = if (n == 0) 0 else 1 + f(n - 1) --- f(1000000) }", "{}");
        assertEquals(ErrorKind.LIMIT, r.error().kind(), r.error().message());
    }

    @Test
    void capsOutputSize() {
        ExecuteResult r = run("(1 to 5000) map $", "{}");
        assertEquals(ErrorKind.LIMIT, r.error().kind());
    }

    @Test
    void reusesCompiledScripts() {
        String script = "payload.n + 1";
        run(script, "{\"n\":1}");
        long t = System.nanoTime();
        for (int i = 0; i < 200; i++) assertEquals("3", compact(run(script, "{\"n\":2}").output()));
        double perRunMs = (System.nanoTime() - t) / 1e6 / 200;
        // Warm cached runs measured ~0.2ms; a recompile is ~3ms. 2ms separates them with margin.
        assertTrue(perRunMs < 2.0, "cached runs took " + perRunMs + " ms each — is the cache being hit?");
    }
}
