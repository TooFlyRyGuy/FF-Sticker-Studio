import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import process from "process";
import fs from "fs";

import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Endpoint to vend configuration to the frontend (REDACTED API KEY)
  app.get("/api/config", (req, res) => {
    res.json({ 
      // Do NOT send the API key to the frontend
      hasKey: !!(process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)
    });
  });

  // Proxy Gemini API calls to the server to prevent key exposure
  app.post("/api/gemini/generate", async (req, res) => {
    const { params } = req.body;
    const { imageBase64, mimeType, referenceImageBase64, referenceMimeType, refStrength, prompt, aspectRatio, imageSize, model } = params;

    const apiKey = (process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "No API key configured on server." });
    }

    console.log(`[Gemini Generate] Starting request with model: ${model}`);
    const startTime = Date.now();

    try {
      const genAI = new GoogleGenAI({ apiKey });
      
      // Build parts
      const parts: any[] = [];
      if (imageBase64 && mimeType) {
         parts.push({ inlineData: { data: imageBase64, mimeType } });
      }
      if (referenceImageBase64 && referenceMimeType) {
         parts.push({ inlineData: { data: referenceImageBase64, mimeType: referenceMimeType } });
      }

      // Build prompt logic (copied from geminiService.ts for consistency)
      let finalPrompt = "";
      if (imageBase64 && referenceImageBase64) {
        finalPrompt = `TASK: Edit the first image based on the user prompt, using the second image as a style reference.

STRICT INSTRUCTIONS FOR IMAGE PROCESSING:
1. IMAGE 1 (First Image) is the SOURCE SUBJECT. You MUST strictly preserve the facial features, identity, and physical likeness of the person in this image.
2. IMAGE 2 (Second Image) is the STYLE REFERENCE. Use this image ONLY for lighting, composition, color palette, and artistic style.
3. CRITICAL: DO NOT use the face, facial features, or identity from Image 2. IGNORE the identity of any person in Image 2.
4. DO NOT BLEND FACES. The resulting image must look exactly like the person in Image 1, but with the style of Image 2.

USER PROMPT: ${prompt}`;

        if (refStrength !== undefined) {
          finalPrompt += `\n\nSTYLE INFLUENCE SETTING: ${refStrength}/100.
          - Apply this strength to the *style transfer* (lighting, colors, texture) only.
          - Identity preservation strength is fixed at 100/100 (Maximum) for Image 1.`;
        }
      } else if (imageBase64) {
        finalPrompt = `TASK: Edit the image based on the user prompt.
        
STRICT INSTRUCTION: Preserve the facial features and identity of the person in the image.

USER PROMPT: ${prompt}`;
      } else {
        finalPrompt = prompt;
      }
      parts.push({ text: finalPrompt });

      const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");
      const configData: any = {
        imageConfig: { aspectRatio },
      };
      if (isHighFidelity && imageSize) {
        configData.imageConfig.imageSize = imageSize;
      }

      const response = await genAI.models.generateContent({
        model: model,
        contents: { parts },
        config: configData,
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        return res.status(400).json({ error: "No candidate returned. The prompt may have were blocked." });
      }

      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const duration = Date.now() - startTime;
            console.log(`[Gemini Generate] Successfully generated image with model: ${model} in ${duration}ms`);
            return res.json({ 
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png'
            });
          }
        }
      }

      // Check for refusal
      const textPart = candidate.content?.parts?.find(p => p.text);
      if (textPart && textPart.text) {
        return res.status(400).json({ error: `Model Refused: ${textPart.text}` });
      }

      return res.status(500).json({ error: "No image data found in response." });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini Generate] Error after ${duration}ms with model: ${model}`, error);
      res.status(error.status || 500).json({ 
        error: error.message || "Internal server error" 
      });
    }
  });

  // Ideas endpoint
  app.post("/api/gemini/ideas", async (req, res) => {
    const { currentPrompt, instruction } = req.body;
    const apiKey = (process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || "").trim();
    
    try {
      const genAI = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are an expert AI image prompt engineer. 
      Your task is to generate 3 distinct, high-quality, and detailed image generation prompts based on the user's input.
      
      CRITICAL RULES FOR EVERY PROMPT:
      1. Every prompt MUST begin exactly with the phrase: "Subject(s) from the source photo depicted as, or transformed into"
      2. Every prompt MUST include the phrase: "Preserve exact facial identity from the source image and subtly enhance attractiveness"
      
      Output format: JSON Array of strings.`;

      let userContent = currentPrompt.trim() 
        ? `Original Prompt: "${currentPrompt}"\n\nTask: Rewrite or enhance the original prompt based on this instruction: "${instruction}".\nProvide 3 distinct variations.`
        : `Task: Generate 3 creative image prompts based on this idea: "${instruction}".`;

      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: userContent,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        }
      });

      res.json({ text: response.text });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Metadata endpoint
  app.post("/api/gemini/metadata", async (req, res) => {
    const { prompt } = req.body;
    const apiKey = (process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || "").trim();
    
    try {
      const genAI = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are an AI assistant that helps categorize and create metadata for image generation prompts. Output JSON with: name, description, category, tags.`;

      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate metadata for: "${prompt}"`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        }
      });

      res.json({ text: response.text });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    // Support client-side routing
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Set timeout to 4 minutes for image generation
  server.timeout = 240000;
}

startServer();
