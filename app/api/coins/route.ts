import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { UserCoins } from "@/models/UserCoins";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        await connectToDatabase();
        const doc = await UserCoins.findOne({ userId }).lean() as any;

        return NextResponse.json({
            balance: doc?.balance ?? 0,
            transactions: (doc?.transactions ?? []).slice(0, 20),
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
