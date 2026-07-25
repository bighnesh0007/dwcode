import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { StorePurchase } from "@/models/StorePurchase";
import { UserCoins } from "@/models/UserCoins";
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

        await connectToDatabase();

        const [purchases, coins] = await Promise.all([
            StorePurchase.find({ userId }).select("itemId").lean(),
            UserCoins.findOne({ userId }).select("balance").lean(),
        ]);

        const owned = [...new Set([...freeIds, ...purchases.map((p) => p.itemId)])];

        return NextResponse.json({
            items: THEME_SKINS,
            owned,
            balance: coins?.balance ?? 0,
            signedIn: true,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

interface MongoDuplicateKeyError {
    code?: number;
}

/**
 * POST /api/store — buy an item with coins.
 *
 * This is the first code path in DWCode that DEBITS coins; every existing path only
 * ever awarded them. Correctness notes:
 *
 *  - The debit is a single conditional `findOneAndUpdate` with `balance: { $gte: cost }`,
 *    so two concurrent purchases cannot both succeed against the same balance. A
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

        await connectToDatabase();

        const existing = await StorePurchase.findOne({ userId, itemId: item.id }).lean();
        if (existing) {
            const coins = await UserCoins.findOne({ userId }).select("balance").lean();
            return NextResponse.json({
                success: true,
                alreadyOwned: true,
                itemId: item.id,
                balance: coins?.balance ?? 0,
            });
        }

        // Atomic conditional debit — fails (returns null) when the balance is short.
        const debited = await UserCoins.findOneAndUpdate(
            { userId, balance: { $gte: item.cost } },
            {
                $inc: { balance: -item.cost },
                $push: {
                    transactions: {
                        $each: [
                            {
                                type: "store_purchase",
                                amount: -item.cost,
                                description: `Purchased ${item.name}`,
                                createdAt: new Date(),
                            },
                        ],
                        $position: 0,
                        $slice: 200,
                    },
                },
            },
            { new: true },
        );

        if (!debited) {
            const coins = await UserCoins.findOne({ userId }).select("balance").lean();
            return NextResponse.json(
                {
                    error: "Not enough coins.",
                    required: item.cost,
                    balance: coins?.balance ?? 0,
                },
                { status: 402 },
            );
        }

        try {
            await StorePurchase.create({ userId, itemId: item.id, cost: item.cost });
        } catch (err) {
            // Lost a race against a concurrent purchase of the same item: the unique
            // index rejected us. Refund so the user is not charged twice.
            if ((err as MongoDuplicateKeyError).code === 11000) {
                await UserCoins.updateOne(
                    { userId },
                    {
                        $inc: { balance: item.cost },
                        $push: {
                            transactions: {
                                $each: [
                                    {
                                        type: "store_refund",
                                        amount: item.cost,
                                        description: `Refund — ${item.name} already owned`,
                                        createdAt: new Date(),
                                    },
                                ],
                                $position: 0,
                                $slice: 200,
                            },
                        },
                    },
                );
                const coins = await UserCoins.findOne({ userId }).select("balance").lean();
                return NextResponse.json({
                    success: true,
                    alreadyOwned: true,
                    itemId: item.id,
                    balance: coins?.balance ?? 0,
                });
            }
            throw err;
        }

        return NextResponse.json({
            success: true,
            itemId: item.id,
            balance: debited.balance,
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
