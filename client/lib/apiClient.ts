/**
 * Client for the DWCode backend (`server/`).
 *
 * This is the seam the whole migration will eventually route through: today only the
 * sponsorship endpoints use it, but every `fetch("/api/...")` in the app will move
 * here as domains are ported off the Next.js API routes.
 *
 * Auth: Clerk session tokens are short-lived (~60s), so `getToken()` must be called
 * per request and its result never cached in a store.
 */
import type { ApiFailure, ApiSuccess } from "./apiTypes";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Bearer token from Clerk's `getToken()`. Omit for anonymous requests. */
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * Call the backend and unwrap the `{ success, data }` envelope.
 *
 * Throws `ApiError` carrying the backend's stable error `code` so callers can branch
 * on it (e.g. `NOT_CONFIGURED`) rather than string-matching messages.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError(
      `Backend returned a non-JSON response (HTTP ${response.status}).`,
      "INVALID_RESPONSE",
      response.status,
    );
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
