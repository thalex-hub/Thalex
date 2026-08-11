import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined");
  }
  return new GoogleGenAI({ apiKey });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { return res.status(200).end(); }
  if (req.method !== "POST") { return res.status(405).end(); }

  try {
    const { prompt, history } = req.body;
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });
    const ai = getGeminiClient();
    let contents: any[] = [];
    if (history && Array.isArray(history)) {
      contents = history.map(item => {
        const role = item.role === 'model' || item.role === 'assistant' ? 'model' : 'user';
        let parts: any[] = [];
        if (typeof item.parts === 'string') parts = [{ text: item.parts }];
        else if (Array.isArray(item.parts)) parts = item.parts.map(p => typeof p === 'string' ? { text: p } : p);
        else if (item.text) parts = [{ text: item.text }];
        else parts = [{ text: String(item.content || '') }];
        return { role, parts };
      });
    }
    contents.push({ role: "user", parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
    });

    return res.json({ response: response.text });
  } catch (error: any) {
    console.error("Gemini route error:", error);
    res.status(500).json({ error: error.message || "An error occurred with Gemini processing" });
  }
}
