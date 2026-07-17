import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { awardCoins } from "@/lib/coins";
import { getErrorMessage } from "@/lib/errors";

const PROBLEM_PROMPT = (difficulty: string, category: string, topic: string) => `
Create a DataWeave coding problem for a practice platform.
Difficulty: ${difficulty}
Category: ${category}
${topic ? `Specific Topic: ${topic}` : ""}

Return ONLY a valid JSON object. Do NOT wrap in markdown or backticks:
{
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "examples": [{ "input": "string", "output": "string", "explanation": "string" }],
  "constraints": ["string"],
  "starterCode": "string (starts with %dw 2.0)",
  "testCases": [{ "input": "string", "expectedOutput": "string" }],
  "hiddenTestCases": [{ "input": "string", "expectedOutput": "string" }],
  "solution": "string",
  "hints": ["string"]
}`;

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { difficulty, category, topic, geminiApiKey } = await req.json();

        if (!geminiApiKey?.trim()) {
            return NextResponse.json({ error: "Gemini API key is required" }, { status: 400 });
        }

        // Use user-supplied key — never persist it
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: geminiApiKey.trim() });

        let text: string;
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: PROBLEM_PROMPT(difficulty || "Medium", category || "Arrays", topic || ""),
            });
            text = response.text || "";
        } catch (genErr) {
            return NextResponse.json({
                success: false,
                error: `Gemini API error: ${getErrorMessage(genErr)}. Check your API key is valid.`,
            }, { status: 400 });
        }

        // Strip markdown fences if present
        text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "").trim();

        let parsedData: unknown;
        try {
            parsedData = JSON.parse(text);
        } catch {
            return NextResponse.json({ success: false, error: "Failed to parse Gemini response as JSON. Try again." }, { status: 500 });
        }
        const newProblem = new Problem(parsedData);

        const slug = newProblem.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");

        await connectToDatabase();

        newProblem.set({
            slug,
            difficulty: difficulty || "Medium",
            category: category || "Arrays",
            createdByAI: true,
            createdBy: userId,
        });
        await newProblem.save();

        // Award 2 coins for creating a problem
        await awardCoins(userId, 2, "problem_created", `Created problem: ${newProblem.title}`);

        return NextResponse.json({ success: true, problem: newProblem });
    } catch (error) {
        return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
    }
}
