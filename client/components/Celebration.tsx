"use client";

/**
 * What a solve earned beyond its coins — the daily bonus and newly unlocked
 * achievements — shown as a dismissible card after an Accepted verdict.
 */
import { useEffect } from "react";
import { Award, CalendarCheck, X } from "lucide-react";
import type { AcceptedRewards } from "@dwcode/shared";

export function hasRewards(rewards: AcceptedRewards | undefined): rewards is AcceptedRewards {
  return Boolean(rewards && (rewards.dailyBonus > 0 || rewards.unlocked.length > 0));
}

export function Celebration({ rewards, onClose }: { rewards: AcceptedRewards; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-primary/30 bg-card shadow-xl p-4 animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">🎉 Nice solve!</p>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <ul className="mt-2 space-y-2 text-sm">
        {rewards.dailyBonus > 0 && (
          <li className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-primary shrink-0" />
            Daily challenge solved: <span className="font-semibold text-yellow-500">+{rewards.dailyBonus} coins</span>
          </li>
        )}
        {rewards.unlocked.map((a) => (
          <li key={a.id} className="flex items-start gap-2">
            <Award className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>
              <span className="font-medium">{a.title}</span>
              <span className="block text-xs text-muted-foreground">{a.description}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
