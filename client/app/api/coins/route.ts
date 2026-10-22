import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getWallet } from "@/lib/repositories/coins";
import { getErrorMessage } from "@/lib/errors";

export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const wallet = await getWallet(userId);

        return NextResponse.json({
            balance: wallet.balance,
            transactions: wallet.transactions.slice(0, 20),
        });
    } catch (error) {
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
