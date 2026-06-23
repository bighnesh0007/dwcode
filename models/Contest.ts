import mongoose from "mongoose";

const ParticipantSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true },
        userName: { type: String, required: true },
        userImageUrl: { type: String, default: "" },
        score: { type: Number, default: 0 },
        solvedProblems: [{ type: String }],   // array of problem slugs solved
        joinedAt: { type: Date, default: Date.now },
        finishedAt: { type: Date },
    },
    { _id: false }
);

const ContestSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },
    createdBy: { type: String, required: true },       // Clerk user ID
    createdByName: { type: String, required: true },
    problems: [{ type: mongoose.Schema.Types.ObjectId, ref: "Problem" }],
    problemSlugs: [{ type: String }],
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    duration: { type: Number, required: true },        // minutes
    status: {
        type: String,
        enum: ["upcoming", "active", "ended"],
        default: "upcoming",
    },
    isPublic: { type: Boolean, default: true },
    maxParticipants: { type: Number, default: 100 },
    participants: [ParticipantSchema],
    inviteCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    createdAt: { type: Date, default: Date.now },
});

// Auto-compute status based on time
ContestSchema.virtual("computedStatus").get(function () {
    const now = new Date();
    if (now < this.startTime) return "upcoming";
    if (now > this.endTime) return "ended";
    return "active";
});

export const Contest =
    mongoose.models.Contest || mongoose.model("Contest", ContestSchema);
