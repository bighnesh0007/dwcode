import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import connectToDatabase from "@/lib/db";
import { Problem } from "@/models/Problem";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ success: false, error: "GEMINI_API_KEY is missing. Please add it to your .env.local file and restart the server." }, { status: 400 });
    }

    const { difficulty, category, topic } = await req.json();

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
  } catch (error: any) {
    console.error("Error generating problem:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
