import { GoogleGenAI } from "npm:@google/genai@1.30.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RefImage {
  base64: string;
  mimeType: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const apiKey = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("NEWGEMINI_API_KEY") || "").trim();

  if (req.method === "GET") {
    return new Response(JSON.stringify({ hasKey: !!apiKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "No Gemini API key configured." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { params } = body;
    const {
      imageBase64,
      mimeType,
      referenceImages,
      refStrength,
      prompt,
      aspectRatio,
      imageSize,
      model,
    } = params || {};

    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "No prompt provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const genAI = new GoogleGenAI({ apiKey });

    const parts: any[] = [];
    if (imageBase64 && mimeType) {
      parts.push({ inlineData: { data: imageBase64, mimeType } });
    }

    const refs: RefImage[] = Array.isArray(referenceImages)
      ? referenceImages.filter((r: RefImage) => r.base64 && r.mimeType)
      : [];

    for (const ref of refs) {
      parts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
    }

    let finalPrompt = "";
    if (imageBase64 && refs.length > 0) {
      const refLabels = refs.map((_, i) => `Reference Image ${i + 1}`).join(", ");
      finalPrompt = `You are given ${refs.length + 1} images and a text prompt.

- The FIRST image is the SOURCE PHOTO. This is the person/subject you are editing. You MUST preserve their face, identity, facial features, body shape, and likeness exactly. This is non-negotiable.
- The remaining image(s) are REFERENCE IMAGES (${refLabels}). Use them for lighting, color grading, mood, composition, texture, and artistic direction. IGNORE the face, body, identity, and any person in the reference images entirely.
- DO NOT blend faces. DO NOT use any reference image's identity. The output must clearly show the FIRST image's person, influenced by the reference image(s).

USER PROMPT: ${prompt}`;

      if (refStrength !== undefined) {
        finalPrompt += `\n\nREFERENCE INFLUENCE: ${refStrength}/100. Apply this strength to the reference influence (lighting, colors, texture) only. Identity preservation of the FIRST image is always 100/100.`;
      }
    } else if (imageBase64) {
      finalPrompt = `Edit the provided image according to the user prompt. Preserve the person's face, identity, and likeness.

USER PROMPT: ${prompt}`;
    } else {
      finalPrompt = prompt;
    }
    parts.push({ text: finalPrompt });

    const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");
    const configData: any = { imageConfig: { aspectRatio } };
    if (isHighFidelity && imageSize) {
      configData.imageConfig.imageSize = imageSize;
    }

    const response = await genAI.models.generateContent({
      model,
      contents: { parts },
      config: configData,
    });

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return new Response(
        JSON.stringify({ error: "No candidate returned. The prompt may have been blocked." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return new Response(
            JSON.stringify({
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || "image/png",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    const textPart = candidate.content?.parts?.find((p: any) => p.text);
    if (textPart && textPart.text) {
      return new Response(
        JSON.stringify({ error: `Model Refused: ${textPart.text}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "No image data found in response." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: error.status || 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
