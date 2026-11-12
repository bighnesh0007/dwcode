package dev.dwcode.compiler;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

class HttpApiTest {
    static final String TOKEN = "t".repeat(40);
    static WorkerPool pool;
    static HttpApi api;
    static String base;
    static final HttpClient http = HttpClient.newHttpClient();

    @BeforeAll
    static void start() throws Exception {
        int port;
        try (ServerSocket s = new ServerSocket(0)) {
            port = s.getLocalPort();
        }
        Config config = Config.fromEnv(Map.of(
                "PORT", Integer.toString(port),
                "COMPILER_AUTH_TOKEN", TOKEN,
                "COMPILER_WORKERS", "1",
                "COMPILER_MAX_SCRIPT_BYTES", "2048",
                "COMPILER_MAX_INPUT_BYTES", "4096"));
        Metrics metrics = new Metrics();
        pool = new WorkerPool(config, metrics);
        pool.start();
        api = new HttpApi(config, pool, metrics);
        api.start();
        base = "http://127.0.0.1:" + port;
    }

    @AfterAll
    static void stop() {
        api.stop();
        pool.close();
    }

    static HttpResponse<String> post(String body, String token) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(base + "/v1/execute"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) b.header("Authorization", "Bearer " + token);
        return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    static HttpResponse<String> get(String path) throws Exception {
        return http.send(HttpRequest.newBuilder(URI.create(base + path)).build(), HttpResponse.BodyHandlers.ofString());
    }

    static final String OK_BODY = "{\"script\":\"%dw 2.0\\noutput application/json\\n---\\npayload.n * 2\","
            + "\"inputs\":[{\"name\":\"payload\",\"value\":\"{\\\"n\\\":21}\"}]}";

    @Test
    void executesWithAValidToken() throws Exception {
        HttpResponse<String> r = post(OK_BODY, TOKEN);
        assertEquals(200, r.statusCode(), r.body());
        assertTrue(r.body().contains("\"ok\":true") && r.body().contains("\"output\":\"42\""), r.body());
    }

    @Test
    void rejectsMissingOrWrongTokens() throws Exception {
        assertEquals(401, post(OK_BODY, null).statusCode());
        assertEquals(401, post(OK_BODY, "x".repeat(40)).statusCode());
    }

    @Test
    void returnsUserErrorsAs200SoTheyAreNotMistakenForOutages() throws Exception {
        HttpResponse<String> r = post("{\"script\":\"%dw 2.0\\n---\\npayload map (\",\"inputs\":[]}", TOKEN);
        assertEquals(200, r.statusCode());
        assertTrue(r.body().contains("\"kind\":\"COMPILE\""), r.body());
    }

    @Test
    void validatesTheRequest() throws Exception {
        assertEquals(400, post("not json", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"\"}", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"x\",\"inputs\":[{\"name\":\"1bad\",\"value\":\"1\"}]}", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"x\",\"inputs\":[{\"name\":\"a\",\"value\":\"1\"},{\"name\":\"a\",\"value\":\"2\"}]}", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"x\",\"inputs\":[{\"name\":\"a\",\"value\":\"1\",\"mimeType\":\"application/java\"}]}", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"" + "x".repeat(2049) + "\"}", TOKEN).statusCode());
        assertEquals(400, post("{\"script\":\"x\",\"unexpected\":1}", TOKEN).statusCode());
    }

    @Test
    void refusesOversizedBodiesBeforeParsing() throws Exception {
        assertEquals(413, post("{\"script\":\"" + "x".repeat(100_000) + "\"}", TOKEN).statusCode());
    }

    @Test
    void probesAreCheapAndUnauthenticated() throws Exception {
        assertEquals(200, get("/health").statusCode());
        assertEquals(200, get("/ready").statusCode());
        HttpResponse<String> m = get("/metrics");
        assertEquals(200, m.statusCode());
        assertTrue(m.body().contains("dwc_workers{state=\"live\"} 1"), m.body());
    }
}
