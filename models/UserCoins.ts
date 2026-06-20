import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema({
    type: { type: String, required: true },        // e.g. "first_solve", "difficulty_bonus", "comment"
    amount: { type: Number, required: true },
    description: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
});

const UserCoinsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    balance: { type: Number, default: 0 },
    transactions: [TransactionSchema],
});

export const UserCoins =
    mongoose.models.UserCoins || mongoose.model("UserCoins", UserCoinsSchema);
