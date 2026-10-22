# DWCode compiler service. Build from the repository root or compiler/:
#   docker build -t dwcode-compiler compiler/
#
# Runs untrusted code, so the image is the outer wall behind the engine's own
# privilege lockdown and the process-per-worker kill switch:
#   - non-root user, no shell tools beyond the JRE base
#   - meant to run with a read-only root filesystem, no capabilities and a pid
#     limit (see docker-compose.yml / render.yaml)

# ── build ─────────────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /src
# Dependencies first, so source edits do not re-download ~25 MB of engine jars.
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src ./src
# Tests spawn worker JVMs and run hostile scripts; they run in CI, not here.
RUN mvn -q -B package -DskipTests

# ── run ───────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S dwc && adduser -S -G dwc -H -s /sbin/nologin dwc
WORKDIR /app
COPY --from=build /src/target/dwcode-compiler.jar ./
COPY --from=build /src/target/lib ./lib
USER dwc

ENV PORT=8080 COMPILER_HOST=0.0.0.0
EXPOSE 8080
# The supervisor itself is light: workers carry the heap (COMPILER_WORKER_HEAP_MB each).
# /tmp is the only writable path the JVM needs; mount it as tmpfs.
ENTRYPOINT ["java", "-Xmx128m", "-XX:+UseSerialGC", "-XX:+ExitOnOutOfMemoryError", "-Djava.io.tmpdir=/tmp", "-jar", "dwcode-compiler.jar"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
