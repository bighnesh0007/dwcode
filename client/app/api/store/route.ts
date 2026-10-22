import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { credit, debitIfAffordable, getBalance } from "@/lib/repositories/coins";
import { hasPurchased, listOwnedItemIds, recordPurchase } from "@/lib/repositories/store";
import { THEME_SKINS, isFreeSkin } from "@/lib/themes";
import { getErrorMessage } from "@/lib/errors";

/**
 * GET /api/store — the catalogue plus what the caller owns and can afford.
 *
 * Public: anonymous visitors see the catalogue with `owned: false` so the store is
 * still browsable (and previewable) without signing in.
 */
export async function GET() {
    try {
        const { userId } = await auth();

        // Free items are owned by definition.
        const freeIds = THEME_SKINS.filter((s) => s.cost === 0).map((s) => s.id);

        if (!userId) {
            return NextResponse.json({
                items: THEME_SKINS,
                owned: freeIds,
                balance: 0,
                signedIn: false,
            });
        }

        const [purchasedIds, balance] = await Promise.all([
            listOwnedItemIds(userId),
            getBalance(userId),
        ]);

        const owned = [...new Set([...freeIds, ...purchasedIds])];

        return NextResponse.json({
            items: THEME_SKINS,
            owned,
            balance,
            signedIn: true,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

/**
 * POST /api/store — buy an item with coins.
 *
 * This is the first code path in DWCode that DEBITS coins; every existing path only
 * ever awarded them. Correctness notes:
 *
 *  - The debit is a single conditional update (debitIfAffordable), so two
 *    concurrent purchases cannot both succeed against the same balance. A
 *    read-then-write would allow exactly that race.
 *  - The ownership row carries a unique index on { userId, itemId }, so a retry cannot
 *    charge twice. If the insert loses a race we refund the debit rather than leaving
 *    the user short.
 *  - `itemId` is validated against the server-side catalogue, so the price is never
 *    taken from the request body.
 */
export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Sign in to buy items." }, { status: 401 });
        }

        const body: unknown = await req.json();
        const itemId =
            typeof body === "object" && body !== null && "itemId" in body
                ? String(body.itemId)
                : "";

        // Price comes from the catalogue, never from the client.
        const item = THEME_SKINS.find((s) => s.id === itemId);
        if (!item) {
            return NextResponse.json({ error: "Unknown item." }, { status: 404 });
        }
        if (isFreeSkin(item.id)) {
            return NextResponse.json({ error: "That item is already free." }, { status: 400 });
        }

        if (await hasPurchased(userId, item.id)) {
            return NextResponse.json({
                success: true,
                alreadyOwned: true,
                itemId: item.id,
                balance: await getBalance(userId),
            });
        }

        // Atomic conditional debit — null when the balance is short.
        const newBalance = await debitIfAffordable(userId, item.cost, {
            type: "store_purchase",
            description: `Purchased ${item.name}`,
        });

        if (newBalance === null) {
            return NextResponse.json(
                {
                    error: "Not enough coins.",
                    required: item.cost,
                    balance: await getBalance(userId),
                },
                { status: 402 },
            );
        }

        if ((await recordPurchase(userId, item.id, item.cost)) === "duplicate") {
            // Lost a race against a concurrent purchase of the same item: the unique
            // index rejected us. Refund so the user is not charged twice.
            await credit(userId, {
                type: "store_refund",
                amount: item.cost,
                description: `Refund — ${item.name} already owned`,
            });
            return NextResponse.json({
                success: true,
                alreadyOwned: true,
                itemId: item.id,
                balance: await getBalance(userId),
            });
        }

        return NextResponse.json({
            success: true,
            itemId: item.id,
            balance: newBalance,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
