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

  const apiKey = (Deno.env.get("GEMINI_API_KEY") || Deno.env.get("NEWGEMINI_API_KEY") || "").trim();

  // GET: config check — does the server have a Gemini key?
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
      referenceImageBase64,
      referenceMimeType,
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
    if (referenceImageBase64 && referenceMimeType) {
      parts.push({ inlineData: { data: referenceImageBase64, mimeType: referenceMimeType } });
    }

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
