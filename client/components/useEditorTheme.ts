"use client";

/**
 * The Monaco theme to use: the equipped editor cosmetic when there is one,
 * otherwise light or dark to match the site. Re-reads after an equip.
 */
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import type { Cosmetic } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";

export function useEditorTheme(resolvedTheme: string | undefined): string {
  const { isSignedIn } = useAuth();
  const [equipped, setEquipped] = useState("");

  useEffect(() => {
    if (!isSignedIn) return;
    const load = () => {
      apiRequest<{ equippedItems: { editor?: Cosmetic } }>("/api/v1/profile-details/me")
        .then((d) => setEquipped(d.equippedItems.editor?.token ?? ""))
        .catch(() => {});
    };
    load();
    window.addEventListener("dwcode:equipped", load);
    return () => window.removeEventListener("dwcode:equipped", load);
  }, [isSignedIn]);

  if (isSignedIn && equipped) return equipped;
  return resolvedTheme === "light" ? "vs-light" : "vs-dark";
}
