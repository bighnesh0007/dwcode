"use client";

/**
 * Store slots beyond accent colours: avatar frames, profile badges, banners
 * and editor themes, each with a rarity. Buy once, then equip one per slot.
 * Accent colours keep their own section above (they're the theme skins).
 */
import { useEffect, useState } from "react";
import { Check, Coins, Loader2, Lock } from "lucide-react";
import { COSMETIC_SLOTS, rarityOf, type Cosmetic, type CosmeticSlot } from "@dwcode/shared";
import { apiRequest } from "@/lib/apiClient";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  cosmetics: Cosmetic[];
  owned: Set<string>;
  balance: number;
  signedIn: boolean;
  onChanged: () => Promise<void>;
}

function Preview({ item }: { item: Cosmetic }) {
  if (item.slot === "frame") return <div className={cn("h-10 w-10 rounded-full bg-muted", item.token)} />;
  if (item.slot === "badge") return <div className="h-10 w-10 grid place-items-center text-2xl">{item.token || "—"}</div>;
  if (item.slot === "banner") return <div className={cn("h-10 w-20 rounded", item.token || "bg-muted")} />;
  return <div className={cn("h-10 w-20 rounded font-mono text-[10px] grid place-items-center", item.token.startsWith("hc-light") ? "bg-white text-black border" : "bg-black text-white")}>{"{ }"}</div>;
}

export function CosmeticsShop({ cosmetics, owned, balance, signedIn, onChanged }: Props) {
  const [equipped, setEquipped] = useState<Partial<Record<CosmeticSlot, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (signedIn) apiRequest<{ equipped: Partial<Record<CosmeticSlot, string>> }>("/api/v1/profile-details/me").then((d) => setEquipped(d.equipped)).catch(() => {});
  }, [signedIn]);

  const act = async (item: Cosmetic, buy: boolean) => {
    setBusy(item.id);
    setError(null);
    try {
      if (buy) {
        await apiRequest("/api/v1/store", { method: "POST", body: { itemId: item.id } });
        await onChanged();
      }
      const res = await apiRequest<{ equipped: Partial<Record<CosmeticSlot, string>> }>("/api/v1/profile-details/equip", { method: "PUT", body: { slot: item.slot, itemId: item.id } });
      setEquipped(res.equipped);
      window.dispatchEvent(new Event("dwcode:equipped"));
    } catch (e) {
      setError(getErrorMessage(e, "That didn't work."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {COSMETIC_SLOTS.filter((s) => s.id !== "accent").map((slot) => {
        const items = cosmetics.filter((c) => c.slot === slot.id);
        const current = equipped[slot.id] ?? items.find((i) => i.cost === 0)?.id;
        return (
          <section key={slot.id} className="space-y-3">
            <h2 className="text-lg font-semibold">{slot.label}s</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {items.map((item) => {
                const has = item.cost === 0 || owned.has(item.id);
                const rarity = rarityOf(item.rarity);
                const isOn = current === item.id;
                return (
                  <Card key={item.id} className={cn(isOn && "border-primary")}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between"><Preview item={item} /><span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase", rarity.className)}>{rarity.label}</span></div>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      {isOn ? (
                        <p className="text-xs font-medium text-primary flex items-center gap-1"><Check className="w-3 h-3" /> Equipped</p>
                      ) : has ? (
                        <Button size="sm" variant="outline" className="w-full text-xs" disabled={!signedIn || busy !== null} onClick={() => void act(item, false)}>
                          {busy === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Equip"}
                        </Button>
                      ) : (
                        <Button size="sm" className="w-full gap-1 text-xs" disabled={!signedIn || busy !== null || balance < item.cost} onClick={() => void act(item, true)}
                          title={!signedIn ? "Sign in to buy" : balance < item.cost ? `Needs ${item.cost - balance} more coins` : `Buy and equip for ${item.cost} coins`}>
                          {busy === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : balance < item.cost ? <Lock className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                          {item.cost}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
