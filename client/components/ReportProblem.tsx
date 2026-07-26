"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    REPORT_REASONS,
    REPORT_REASON_LABELS,
    REPORT_DETAILS_MAX_LENGTH,
    type ReportReason,
} from "@/lib/reports";
import { getErrorMessage } from "@/lib/errors";

/**
 * "Report a problem" — the escape hatch for a broken question.
 *
 * Until hidden tests are executed (FEAT-01), a problem with a wrong expected
 * output is unpassable and the solver has no way to tell whether they are wrong
 * or the problem is. This is how they say so.
 *
 * Collapsed by default: it must be findable without competing with the actual
 * task on the page.
 */
export function ReportProblem({ problemId }: { problemId: string }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState<ReportReason>("wrong-expected-output");
    const [details, setDetails] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [alreadyReported, setAlreadyReported] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Surface an existing open report so the user is not left wondering whether
    // their first one registered.
    useEffect(() => {
        let cancelled = false;
        void fetch(`/api/problems/report?problemId=${problemId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { report?: unknown } | null) => {
                if (!cancelled && d?.report) setAlreadyReported(true);
            })
            .catch(() => {
                /* signed out, or offline — the button still works */
            });
        return () => {
            cancelled = true;
        };
    }, [problemId]);

    const submit = useCallback(async () => {
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch("/api/problems/report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ problemId, reason, details: details.trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error ?? `Could not submit (HTTP ${res.status}).`);
                return;
            }
            setAlreadyReported(true);
            setOpen(false);
            setDetails("");
        } catch (e) {
            setError(getErrorMessage(e, "Could not submit the report."));
        } finally {
            setSubmitting(false);
        }
    }, [problemId, reason, details]);

    if (alreadyReported) {
        return (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500" aria-hidden />
                Thanks — you&apos;ve reported this problem. We&apos;ll take a look.
            </p>
        );
    }

    if (!open) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setOpen(true)}
            >
                <Flag className="h-3.5 w-3.5" aria-hidden />
                Report an issue with this problem
            </Button>
        );
    }

    return (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
            <p className="text-xs font-semibold">Report an issue</p>

            <div>
                <label htmlFor="report-reason" className="mb-1 block text-xs text-muted-foreground">
                    What&apos;s wrong?
                </label>
                <select
                    id="report-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as ReportReason)}
                    className="w-full rounded border bg-background px-2 py-1.5 text-xs"
                >
                    {REPORT_REASONS.map((r) => (
                        <option key={r} value={r}>
                            {REPORT_REASON_LABELS[r]}
                        </option>
                    ))}
                </select>
            </div>

            <div>
                <label htmlFor="report-details" className="mb-1 block text-xs text-muted-foreground">
                    Details <span className="opacity-60">(optional)</span>
                </label>
                <textarea
                    id="report-details"
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX_LENGTH))}
                    rows={3}
                    placeholder="What did you expect, and what happened instead?"
                    className="w-full resize-y rounded border bg-background px-2 py-1.5 text-xs"
                />
                <p className="mt-1 text-right text-[10px] text-muted-foreground tabular-nums">
                    {details.length}/{REPORT_DETAILS_MAX_LENGTH}
                </p>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2">
                <Button type="button" size="sm" className="h-7 text-xs" onClick={submit} disabled={submitting}>
                    {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Submit report
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                        setOpen(false);
                        setError(null);
                    }}
                    disabled={submitting}
                >
                    Cancel
                </Button>
            </div>
        </div>
    );
}
