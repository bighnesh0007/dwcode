/**
 * The only code that talks to the DataWeave compiler.
 *
 * A direct port of server/dataweaverunner.js. Every thrown message string is
 * reproduced CHARACTER-FOR-CHARACTER, because the legacy contract surfaces them
 * to the client as `{ error: <message> }` and the DWCode UI prints them raw.
 * Changing this text is a user-visible breaking change.
 *
 * What is new: typing, injectable `fetch` (so tests need no network), structured
 * logging instead of console.log, and `AbortSignal.timeout` instead of a manual
 * timer.
 */
import { LegacyCompilerError } from "../../errors/AppError.ts";
import { contextLogger } from "../../lib/logger.ts";
import type { FetchLike } from "../../types/ports.ts";

export interface LegacyInput {
  name: unknown;
  value: unknown;
  mimeType?: string;
}

export interface DataWeaveClientOptions {
  url: string;
  version: string;
  timeoutMs: number;
}

interface CompilerResponseBody {
  output?: unknown;
  error?: unknown;
}

export class DataWeaveClient {
  constructor(
    private readonly opts: DataWeaveClientOptions,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  get url(): string {
    return this.opts.url;
  }

  /**
   * Compile+run a script. Resolves with the unwrapped output (object, array,
   * number or string). Throws `LegacyCompilerError` for every failure mode.
   */
  async execute(script: unknown, inputs: LegacyInput[]): Promise<unknown> {
    // Message text preserved verbatim from dataweaverunner.js.
    if (!script || typeof script !== "string") {
      throw new LegacyCompilerError("`script` is required and must be a string");
    }
    if (!Array.isArray(inputs)) {
      throw new LegacyCompilerError("`inputs` must be an array");
    }

    const log = contextLogger();

    const body = {
      script,
      inputs: inputs.map((input, i) => {
        if (!input || typeof input.name !== "string") {
          throw new LegacyCompilerError(`inputs[${i}] is missing a valid "name"`);
        }
        return {
          name: input.name,
          value:
            typeof input.value === "string"
              ? input.value
              : JSON.stringify(input.value, null, 2),
          mimeType: input.mimeType || "application/json",
        };
      }),
      version: this.opts.version,
    };

    log.debug(
      {
        url: this.opts.url,
        version: this.opts.version,
        scriptLength: script.length,
        inputs: body.inputs.map((i) => ({ name: i.name, mimeType: i.mimeType })),
      },
      "[dw] preparing request",
    );

    let response: Response;
    try {
      response = await this.fetchImpl(this.opts.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.opts.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "TimeoutError") {
        throw new LegacyCompilerError(
          `DataWeave compiler did not respond within ${this.opts.timeoutMs}ms (is the Docker container on ${this.opts.url} running?)`,
          err,
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new LegacyCompilerError(
        `Could not reach DataWeave compiler at ${this.opts.url}: ${message}`,
        err,
      );
    }

    if (!response.ok) {
      // Append the upstream body text when there is any, matching the original.
      let detail = "";
      try {
        const text = await response.text();
        detail = text ? ` - ${text}` : "";
      } catch {
        /* ignore */
      }
      throw new LegacyCompilerError(
        `Compiler responded with HTTP ${response.status}${detail}`,
      );
    }

    const result = (await response.json()) as CompilerResponseBody;

    if (result.error) {
      // Upstream `error` is usually a string, but can be an object. Stringify it
      // safely so the message never degrades to "[object Object]" — these strings are
      // shown verbatim in the DWCode UI.
      const message =
        typeof result.error === "string" ? result.error : JSON.stringify(result.error);
      throw new LegacyCompilerError(message);
    }

    // The original returns JSON.parse(result.output), falling back to the raw
    // value when it is not parseable JSON.
    try {
      return JSON.parse(result.output as string);
    } catch {
      return result.output;
    }
  }
}
