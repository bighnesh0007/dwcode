import { NextResponse } from "next/server";
import { getErrorMessage } from "@/lib/errors";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-2.0-flash";

type AIMode =
    | "explain"    // explain what the script does
    | "errors"     // identify errors / why it failed
    | "optimize"   // suggest optimizations
    | "generate"   // generate DataWeave code from natural-language prompt
    | "suggest";   // general improvement suggestions

const SYSTEM = `You are an expert DataWeave 2.0 developer and MuleSoft architect.
You give concise, accurate, actionable answers. Format responses in plain text with
short markdown sections (## heading, bullet points, code blocks) where appropriate.
Keep answers focused and under 400 words unless a detailed explanation is asked for.`;

function buildPrompt(
    mode: AIMode,
    script: string,
    inputSample: string,
    outputSample: string,
    userPrompt?: string
): string {
    const scriptBlock = script
        ? `\`\`\`dataweave\n${script.slice(0, 4000)}\n\`\`\``
        : "(no script provided)";

    const inputBlock = inputSample
        ? `**Input sample:**\n\`\`\`\n${inputSample.slice(0, 1500)}\n\`\`\``
        : "";

    const outputBlock = outputSample
        ? `**Output / error:**\n\`\`\`\n${outputSample.slice(0, 1500)}\n\`\`\``
        : "";

    const context = [scriptBlock, inputBlock, outputBlock].filter(Boolean).join("\n\n");

    switch (mode) {
        case "explain":
            return `${SYSTEM}\n\nExplain the following DataWeave 2.0 script step-by-step. Describe what each major part does and what the overall transformation achieves.\n\n${context}`;

        case "errors":
            return `${SYSTEM}\n\nThe following DataWeave 2.0 script produced an error or unexpected output. Identify the root cause(s), explain why they occur, and provide a corrected version of the script.\n\n${context}`;

        case "optimize":
            return `${SYSTEM}\n\nReview the following DataWeave 2.0 script and suggest concrete optimizations for readability, performance, and idiomatic usage. Show improved code where relevant.\n\n${context}`;

        case "generate":
            return `${SYSTEM}\n\nWrite a DataWeave 2.0 script that does the following:\n\n> ${userPrompt ?? "transform the payload"}\n\n${inputBlock ? `Use this as the input structure:\n${inputBlock}` : ""}`;

        case "suggest":
        default:
            return `${SYSTEM}\n\nReview the following DataWeave 2.0 script and provide up to 5 concrete suggestions to improve it — covering correctness, readability, error handling, and best practices.\n\n${context}`;
    }
}

export async function POST(req: Request) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "GEMINI_API_KEY is not configured on the server." },
                { status: 503 }
            );
        }

        const body = await req.json();
        const { mode, script, inputSample, outputSample, userPrompt } = body as {
            mode: AIMode;
            script?: string;
            inputSample?: string;
            outputSample?: string;
            userPrompt?: string;
        };

        if (!mode) {
            return NextResponse.json({ error: "Missing 'mode' field." }, { status: 400 });
        }

        const prompt = buildPrompt(
            mode,
            script ?? "",
            inputSample ?? "",
            outputSample ?? "",
            userPrompt
        );

        const ai = new GoogleGenAI({ apiKey });
        console.log(`[playground/ai] mode=${mode} model=${MODEL} promptLen=${prompt.length}`);
        const response = await ai.models.generateContent({
            model: MODEL,
            contents: prompt,
        });

        const text = response.text?.trim() ?? "";
        if (!text) throw new Error("Empty response from Gemini.");
        console.log(`[playground/ai] success responseLen=${text.length}`);

        return NextResponse.json({ result: text });
    } catch (error) {
        console.error(`[playground/ai] ERROR model=${MODEL}:`, getErrorMessage(error));
        return NextResponse.json(
            { error: getErrorMessage(error, "AI request failed.") },
            { status: 500 }
        );
    }
}

export async function GET() {
    return NextResponse.json({ status: "alive" });
}
