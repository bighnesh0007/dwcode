/**
 * The model call behind problem generation, as a port so the service can be
 * tested without the network. `GeminiProblemGenerator` is the real one.
 */
import { GoogleGenAI } from "@google/genai";

export interface ProblemGenerator {
  /** Raw model text for `prompt`, using `apiKey`. Throws on any upstream failure. */
  generate(prompt: string, apiKey: string): Promise<string>;
}

const MODEL = "gemini-2.5-flash";

export class GeminiProblemGenerator implements ProblemGenerator {
  async generate(prompt: string, apiKey: string): Promise<string> {
    // A client per call: the public route uses the caller's own key, never persisted.
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({ model: MODEL, contents: prompt });
    return response.text ?? "";
  }
}
