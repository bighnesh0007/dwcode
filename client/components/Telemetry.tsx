"use client";

/**
 * Anonymous telemetry (Phase F): uncaught errors and page views, sent to the
 * server for the admin error inbox and analytics. No user ids; paths only,
 * never query strings. At most a few reports per page load, and nothing in
 * development.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { API_BASE_URL } from "@/lib/apiClient";

const MAX_ERRORS_PER_LOAD = 5;
let sent = 0;
const seen = new Set<string>();

function post(path: string, body: unknown) {
  const url = `${API_BASE_URL}/api/v1/telemetry/${path}`;
  const data = JSON.stringify(body);
  try {
    if (navigator.sendBeacon?.(url, new Blob([data], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: data, keepalive: true }).catch(() => {});
}

function report(message: string, source?: string, stack?: string) {
  if (process.env.NODE_ENV !== "production" || sent >= MAX_ERRORS_PER_LOAD) return;
  const key = `${message}|${source ?? ""}`;
  if (seen.has(key)) return;
  seen.add(key);
  sent++;
  post("error", {
    message: message.slice(0, 2000),
    ...(source ? { source: source.slice(0, 500) } : {}),
    ...(stack ? { stack: stack.slice(0, 8000) } : {}),
    url: window.location.pathname,
  });
}

export function Telemetry() {
  const pathname = usePathname();

  useEffect(() => {
    const onError = (e: ErrorEvent) => report(e.message || "Unknown error", e.filename, e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r: unknown = e.reason;
      report(r instanceof Error ? r.message : String(r), undefined, r instanceof Error ? r.stack : undefined);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !pathname) return;
    post("pageview", { path: pathname });
  }, [pathname]);

  return null;
}
