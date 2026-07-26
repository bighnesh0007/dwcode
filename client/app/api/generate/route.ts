import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";
import { DEFAULT_DIFFICULTY, isDifficulty } from "@dwcode/shared";
import { requireAdmin } from "@/lib/adminCheck";
import { getErrorMessage } from "@/lib/errors";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * `topic` is free text that lands inside the prompt, so it is the one field a
 * caller can use to steer the model (finding M-2). Cap its length and strip the
 * characters that would let it close the instruction block or inject a fake
 * turn. Admin-only access makes this defence-in-depth rather than the only
 * control, but the AI still writes straight to the problem bank.
 */
function sanitizeTopic(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[`{}<>\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * POST /api/generate — admin only.
 *
 * Was UNAUTHENTICATED (audit finding C-2), which let anyone drain the platform's
 * Gemini quota and write generated documents into the problem bank. The only
 * caller has always been the admin dashboard (app/admin/page.tsx), so gating on
 * `requireAdmin()` restores the intended contract without changing behaviour for
 * legitimate users. Users without admin rights have `/api/generate-public`,
 * which requires them to bring their own key.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing. Please add it to your .env.local file and restart the server." }, { status: 400 });
    }

    const body = await req.json();
    const difficulty: string = isDifficulty(body?.difficulty) ? body.difficulty : DEFAULT_DIFFICULTY;
    const category: string =
      typeof body?.category === "string" && body.category.trim()
        ? body.category.trim().slice(0, 60)
        : "Arrays";
    const topic = sanitizeTopic(body?.topic);

    const prompt = `Create a DataWeave coding problem for a platform similar to LeetCode.
Difficulty: ${difficulty}
Category: ${category}
${topic ? `Specific Topic: ${topic}` : ""}

Return ONLY a valid JSON object matching this schema. Do not wrap in markdown tags like \`\`\`json:
{
  "title": "string (Short descriptive title)",
  "description": "string (Detailed problem description)",
  "tags": ["string"],
  "examples": [
    {
      "input": "string (JSON string representation)",
      "output": "string (JSON string representation)",
      "explanation": "string (optional)"
    }
  ],
  "constraints": ["string"],
  "starterCode": "string (DataWeave 2.0 template starting with %dw 2.0)",
  "testCases": [
    {
      "input": "string",
      "expectedOutput": "string"
    }
  ],
  "hiddenTestCases": [
    {
      "input": "string",
      "expectedOutput": "string"
    }
  ],
  "solution": "string (The complete DataWeave solution)",
  "hints": ["string"]
}

Questions should test real DataWeave skills. Avoid trivial questions. Include MuleSoft integration scenarios where possible.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    let text = response.text;
    if (!text) {
      throw new Error("No text generated from Gemini");
    }

    // Clean up markdown wrapping if Gemini ignores instructions
    if (text.startsWith("```json")) {
      text = text.replace(/^```json\n/, "").replace(/\n```$/, "");
    }

    const generatedData = JSON.parse(text);

    // The model does not always honour the schema. Full validation of AI output
    // is SEC-15; this guard just stops a missing title crashing the handler.
    if (typeof generatedData?.title !== "string" || !generatedData.title.trim()) {
      return NextResponse.json(
        { success: false, error: "Model returned no usable title. Try again." },
        { status: 502 },
      );
    }

    // Create a slug from the title
    const slug = generatedData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

    await connectToDatabase();

    const newProblem = new Problem({
      ...generatedData,
      slug,
      difficulty,
      category,
      createdByAI: true,
    });

    await newProblem.save();

    return NextResponse.json({ success: true, problem: newProblem });
  } catch (error) {
    console.error("Error generating problem:", error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}
