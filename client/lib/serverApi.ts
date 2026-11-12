/**
 * Call server/ from SERVER code in this app — server components, route
 * handlers, `generateMetadata`, the sitemap. Browser code uses `apiRequest`
 * from ./apiClient (same-origin /backend, cookie sent by the browser).
 *
 * Goes straight to the internal address (never out through the tunnel), and
 * forwards the visitor's Clerk session as a bearer token so the API sees the
 * same user the page does.
 */
import { cookies } from "next/headers";
import { ApiError } from "./apiClient";
import type { ApiFailure, ApiSuccess } from "./apiTypes";

const BACKEND = (process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");

export interface ServerApiOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Forward the visitor's session. Off for public data that must not vary by user (sitemap). */
  asUser?: boolean;
}

export async function serverApi<T>(path: string, options: ServerApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.asUser !== false) {
    const session = (await cookies()).get("__session")?.value;
    if (session) headers.Authorization = `Bearer ${session}`;
  }

  const response = await fetch(`${BACKEND}${path}`, {
    method: options.method ?? "GET",
    headers,
    cache: "no-store",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(`Backend returned a non-JSON response (HTTP ${response.status}).`, "INVALID_RESPONSE", response.status);
  }
  if (!response.ok || !(payload as ApiSuccess<T>).success) {
    const failure = payload as ApiFailure;
    throw new ApiError(
      failure.error?.message ?? `Request failed (HTTP ${response.status}).`,
      failure.error?.code ?? "UNKNOWN",
      response.status,
      failure.error?.requestId,
      failure.error?.details,
    );
  }
  return (payload as ApiSuccess<T>).data;
}

/** `serverApi`, but a 404 becomes `null` — for pages that call notFound(). */
export async function serverApiOrNull<T>(path: string, options: ServerApiOptions = {}): Promise<T | null> {
  try {
    return await serverApi<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
