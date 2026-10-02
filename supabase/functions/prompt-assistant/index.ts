import OpenAI from "npm:openai@7.15.0";
import { GoogleGenAI } from "npm:@google/genai@1.30.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = (Deno.env.get("OPENAI_API_KEY") || "").trim();

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "No OpenAI API key configured." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { currentPrompt, instruction, type } = body;

    if (type === "metadata") {
      const { prompt } = body;
      if (!prompt || !prompt.trim()) {
        return new Response(JSON.stringify({ error: "No prompt provided." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const openai = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "You are a metadata generator for AI image prompts. Return JSON with: name (short title), description (5-10 words), category (one of: Portrait, Cinematic, Fantasy, Vintage, Nature, Abstract, Studio, Illustration, Other), tags (array of 3-5 keywords). Output ONLY valid JSON." },
            { role: "user", content: `Generate metadata for this image generation prompt: "${prompt}"` },
          ],
          response_format: { type: "json_object" },
        });

        const metaText = completion.choices[0].message.content || "";
        return new Response(JSON.stringify({ text: metaText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (openaiError: any) {
        const geminiKey = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("NEWGEMINI_API_KEY") || "").trim();
        if (!geminiKey) throw openaiError;
        const genAI = new GoogleGenAI({ apiKey: geminiKey });
        const metaResponse = await genAI.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Generate metadata for this image generation prompt: "${prompt}".\nReturn JSON with: name (short title), description (5-10 words max), category (one of: Portrait, Cinematic, Fantasy, Vintage, Nature, Abstract, Studio, Illustration, Other), tags (array of 3-5 keywords).\nOutput ONLY valid JSON.`,
          config: { responseMimeType: "application/json" },
        });
        const metaText = metaResponse.text || "";
        return new Response(JSON.stringify({ text: metaText }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (!currentPrompt && !instruction) {
      return new Response(JSON.stringify({ error: "No prompt or instruction provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openai = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });

    const systemInstruction = `You are an expert AI image prompt engineer.
      Your task is to generate 3 distinct, high-quality, and highly detailed image generation prompts based on the user's input.

      GUIDELINES FOR EVERY PROMPT:
      1. COMPREHENSIVE DETAIL: Write extremely rich, descriptive, and lengthy prompts. Do not be brief. Elaborate on every aspect of the scene, including lighting, camera specs, atmosphere, texture, and material details.
      2. PRESERVATION: Heavily incorporate and retain the core concepts, subjects, and intent from the original prompt. Do not discard user-provided details.
      3. FACIAL IDENTITY: CRITICAL: Preserve the facial identity of the person or persons in the source photo if applicable.
      4. VARIATION: The 3 variations must be meaningfully distinct—different times of day, different sub-styles, or different emotional tones—while still anchored to the original subject matter.

      Output format: JSON object with key "prompts" containing an array of 3 strings.`;

    const userContent = (currentPrompt || "").trim()
      ? `Original Prompt: "${currentPrompt}"\n\nTask: Rewrite or enhance the original prompt based on this instruction: "${instruction}".\nProvide 3 distinct variations.`
      : `Task: Generate 3 creative image prompts based on this idea: "${instruction}".`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    if (!content) {
      throw new Error("AI returned an empty response.");
    }

    let sanitizedText = content.trim();
    if (sanitizedText.startsWith("```json")) {
      sanitizedText = sanitizedText.substring(7);
    }
    if (sanitizedText.startsWith("```")) {
      sanitizedText = sanitizedText.substring(3);
    }
    if (sanitizedText.endsWith("```")) {
      sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
    }
    sanitizedText = sanitizedText.trim();

    return new Response(JSON.stringify({ text: sanitizedText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: error.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
