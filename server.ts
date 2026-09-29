import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import process from "process";
import OpenAI from "openai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '100mb' }));

  // Ideas endpoint (OpenAI)
  app.post("/api/gemini/ideas", async (req, res) => {
    const { currentPrompt, instruction } = req.body;
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();

    if (!apiKey) {
      console.error("[OpenAI] API key is missing");
      return res.status(500).json({ error: "OpenAI API key is not configured." });
    }

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1"
      });
      const systemInstruction = `You are an expert AI image prompt engineer.
      Your task is to generate 3 distinct, high-quality, and highly detailed image generation prompts based on the user's input.

      GUIDELINES FOR EVERY PROMPT:
      1. COMPREHENSIVE DETAIL: Write extremely rich, descriptive, and lengthy prompts. Do not be brief. Elaborate on every aspect of the scene, including lighting, camera specs, atmosphere, texture, and material details.
      2. PRESERVATION: Heavily incorporate and retain the core concepts, subjects, and intent from the original prompt. Do not discard user-provided details.
      3. FACIAL IDENTITY: CRITICAL: Preserve the facial identity of the person or persons in the source photo if applicable.
      4. VARIATION: The 3 variations must be meaningfully distinct—different times of day, different sub-styles, or different emotional tones—while still anchored to the original subject matter.

      Output format: JSON Array of strings.`;

      let userContent = currentPrompt.trim()
        ? `Original Prompt: "${currentPrompt}"\n\nTask: Rewrite or enhance the original prompt based on this instruction: "${instruction}".\nProvide 3 distinct variations.`
        : `Task: Generate 3 creative image prompts based on this idea: "${instruction}".`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error("AI returned an empty response.");
      }

      let sanitizedText = content.trim();
      if (sanitizedText.startsWith('```json')) {
        sanitizedText = sanitizedText.substring(7);
      }
      if (sanitizedText.startsWith('```')) {
        sanitizedText = sanitizedText.substring(3);
      }
      if (sanitizedText.endsWith('```')) {
        sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
      }
      sanitizedText = sanitizedText.trim();

      res.json({ text: sanitizedText });
    } catch (e: any) {
      console.error("[OpenAI Ideas] Error:", e);
      res.status(500).json({ error: e.message || "Failed to generate ideas" });
    }
  });

  // Metadata endpoint (OpenAI)
  app.post("/api/gemini/metadata", async (req, res) => {
    const { prompt } = req.body;
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();

    if (!apiKey) {
      console.error("[OpenAI] API key is missing");
      return res.status(500).json({ error: "OpenAI API key is not configured." });
    }

    try {
      const openai = new OpenAI({
        apiKey,
        baseURL: "https://api.openai.com/v1"
      });
      const systemInstruction = `You are an AI assistant that helps categorize and create metadata for image generation prompts. Description MUST be 5-10 words maximum. Output JSON with: name, description, category, tags.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Generate metadata for: "${prompt}"` }
        ],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content;

      let sanitizedText = content ? content.trim() : "";
      if (sanitizedText.startsWith('```json')) {
        sanitizedText = sanitizedText.substring(7);
      }
      if (sanitizedText.startsWith('```')) {
        sanitizedText = sanitizedText.substring(3);
      }
      if (sanitizedText.endsWith('```')) {
        sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
      }
      sanitizedText = sanitizedText.trim();

      res.json({ text: sanitizedText });
    } catch (e: any) {
      console.error("[OpenAI Metadata] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.timeout = 240000;
}

startServer();
