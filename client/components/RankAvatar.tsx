"use client";

import Image from "next/image";
import { RANK_TIERS, getTier } from "@/lib/ranks";

/**
 * Avatar wrapped in a rank-tier ring effect.
 * Ring styles live in the RANK AVATAR EFFECTS section of app/globals.css.
 */
export default function RankAvatar({
    name,
    imageUrl,
    tierId,
    size = 64,
    showTierBadge = false,
}: {
    name: string;
    imageUrl?: string;
    tierId: string;
    /** Avatar diameter in px (ring padding is added around it). */
    size?: number;
    showTierBadge?: boolean;
}) {
    const tier = RANK_TIERS.find((t) => t.id === tierId) ?? getTier(0);
    const initial = name.trim().charAt(0).toUpperCase() || "?";
    const title = `${name} — ${tier.label}`;

    return (
        <div className="inline-flex flex-col items-center gap-2">
            <div className={`rank-ring rank-ring-${tier.id}`} title={title}>
                <div className="rank-ring-inner">
                    {imageUrl ? (
                        <Image
                            unoptimized
                            src={imageUrl}
                            width={size}
                            height={size}
                            alt={title}
                            className="rounded-full object-cover"
                            style={{ width: size, height: size }}
                        />
                    ) : (
                        <div
                            role="img"
                            aria-label={title}
                            className="rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary select-none"
                            style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) }}
                        >
                            {initial}
                        </div>
                    )}
                </div>
            </div>
            {showTierBadge && (
                <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tier.bg} ${tier.color}`}
                    title={`${tier.label} tier (${tier.min}+ pts)`}
                >
                    <span aria-hidden="true">{tier.icon}</span> {tier.label}
                </span>
            )}
        </div>
    );
}
