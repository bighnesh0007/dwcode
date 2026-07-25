import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserCoins } from "@/models/UserCoins";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const doc = await UserCoins.findOne({ userId }).lean();

        return NextResponse.json({
            balance: doc?.balance ?? 0,
            transactions: (doc?.transactions ?? []).slice(0, 20),
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
