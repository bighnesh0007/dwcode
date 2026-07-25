import type { Application } from "express";
import { buildApp } from "../../src/app.ts";
import { buildContainer, type ContainerOverrides } from "../../src/container.ts";
import type { FetchLike } from "../../src/types/ports.ts";

/** Build the real app with fakes injected. No port is bound. */
export function buildTestApp(overrides: ContainerOverrides = {}): Application {
  return buildApp(buildContainer(overrides));
}

/** A `fetch` stub that returns a canned JSON response. */
export function jsonFetch(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): FetchLike {
  const status = init.status ?? 200;
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
}

/** A `fetch` stub returning a non-JSON body with the given status. */
export function textFetch(text: string, status = 500): FetchLike {
  return () => Promise.resolve(new Response(text, { status }));
}

/** A `fetch` stub that rejects, simulating an unreachable upstream. */
export function failingFetch(error: Error): FetchLike {
  return () => Promise.reject(error);
}

/** A `fetch` stub that records what it was called with. */
export function recordingFetch(response: unknown): {
  fetchImpl: FetchLike;
  calls: { url: string; body: unknown }[];
} {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl: FetchLike = (input, init) => {
    calls.push({
      // `input` may be a string, URL or Request; each needs a different accessor to
      // avoid stringifying to "[object Object]".
      url:
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
    });
    return Promise.resolve(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  };
  return { fetchImpl, calls };
}
