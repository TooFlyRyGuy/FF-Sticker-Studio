import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType } from "../types";

interface EditImageParams {
  imageBase64?: string | null;
  mimeType?: string | null;
  referenceImageBase64?: string | null;
  referenceMimeType?: string | null;
  refStrength?: number;
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
}

export const resolveApiKey = async (model?: string) => {
  // Check for paid keys provided by the user in Settings -> Secrets
  // We use import.meta.env for Vite browser compatibility
  const customKey = import.meta.env.VITE_GEMINI_API_KEY || 
                    import.meta.env.VITE_PAID_API_KEY || 
                    import.meta.env.VITE_GEMINI_PAID_API_KEY || 
                    import.meta.env.VITE_API_KEY;
                    
  // If the user explicitly provided a VITE_ key, force the app to use it.
  if (customKey) {
    return customKey;
  }

  let serverKey = "";
  // Fetch the dynamically injected secret at runtime
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    serverKey = data.apiKey || "";
  } catch(e) {
    // runtime config might not exist in all environments
  }

  let bakedKey = "";
  try {
      // @ts-ignore
      bakedKey = process.env.GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || "";
  } catch (e) {
  }

  const finalKey = customKey || serverKey || bakedKey || "";
  if (!finalKey) {
      throw new Error("No API key available. Please add VITE_GEMINI_API_KEY in Settings -> Secrets.");
  }
  return finalKey;
};

const ensureBase64 = async (data: string, defaultMime: string): Promise<{ data: string; mime: string }> => {
  if (data.startsWith('http://') || data.startsWith('https://')) {
    try {
      const response = await fetch(data);
      const blob = await response.blob();
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return { data: base64Data, mime: blob.type || defaultMime };
    } catch (e) {
      console.error("Failed to fetch image URL:", e);
      return { data, mime: defaultMime }; // fallback
    }
  }
  return { data, mime: defaultMime };
};

export const generateEditedImage = async (params: EditImageParams): Promise<string> => {
  let { imageBase64, mimeType, referenceImageBase64, referenceMimeType, refStrength, prompt, aspectRatio, imageSize, model } = params;

  if (imageBase64) {
    const result = await ensureBase64(imageBase64, mimeType || 'image/png');
    imageBase64 = result.data;
    mimeType = result.mime;
  }

  if (referenceImageBase64) {
    const result = await ensureBase64(referenceImageBase64, referenceMimeType || 'image/png');
    referenceImageBase64 = result.data;
    referenceMimeType = result.mime;
  }

  // Initialize a new instance to ensure we capture the selected API key
  const apiKey = await resolveApiKey(model);
  const ai = new GoogleGenAI({ 
    apiKey
  });

  // Build the content parts
  // Part 1: Source Image (if provided)
  const parts: any[] = [];
  
  if (imageBase64 && mimeType) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    });
  }

  // Part 2: Reference Image (if provided)
  if (referenceImageBase64 && referenceMimeType) {
    parts.push({
      inlineData: {
        data: referenceImageBase64,
        mimeType: referenceMimeType,
      },
    });
  }

  // Part 3: Text Prompt
  // We restructure the prompt to be extremely explicit about roles.
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
    // Single image case
    finalPrompt = `TASK: Edit the image based on the user prompt.
    
STRICT INSTRUCTION: Preserve the facial features and identity of the person in the image.

USER PROMPT: ${prompt}`;
  } else {
    // No source image, just generate
    finalPrompt = prompt;
  }

  parts.push({
    text: finalPrompt,
  });

  try {
    const isHighFidelity = model === ModelType.PRO || model === ModelType.FLASH_3_1;
    const configData: any = {
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    };
    
    // imageSize is only supported by higher tier models
    if (isHighFidelity && imageSize) {
       configData.imageConfig.imageSize = imageSize;
    }

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: configData,
    });

    // 1. Check for prompt feedback (Prompt Blocking)
    // The SDK type might not always expose promptFeedback directly on the top level depending on version,
    // but we check if candidates exist.
    const candidate = response.candidates?.[0];
    
    if (!candidate) {
        // If there are no candidates, the model likely blocked the request entirely.
        const feedback = (response as any).promptFeedback;
        if (feedback && feedback.blockReason) {
             throw new Error(`Request blocked: ${feedback.blockReason}`);
        }
        throw new Error("The model failed to generate a response. The prompt may have violated safety policies.");
    }

    // 2. Look for Image Data in Parts
    if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                // Use the MIME type returned by the model, or default to png
                const respMime = part.inlineData.mimeType || 'image/png';
                return `data:${respMime};base64,${part.inlineData.data}`;
            }
        }
    }

    // 3. Look for Text Explanation (Refusal)
    // If the model refuses (e.g. "I cannot process this image"), it returns text.
    if (candidate.content?.parts) {
        const textPart = candidate.content.parts.find(p => p.text);
        if (textPart && textPart.text) {
            throw new Error(`Model Refused: ${textPart.text}`);
        }
    }

    // 4. Check Finish Reason
    if (candidate.finishReason) {
         if (candidate.finishReason === 'SAFETY') {
             throw new Error("Image generation stopped due to safety filters.");
         }
         if (candidate.finishReason !== 'STOP') {
             throw new Error(`Generation stopped due to: ${candidate.finishReason}`);
         }
    }

    throw new Error("No image data found in response. The model returned a valid response but it contained no image.");

  } catch (error: any) {
    handleGeminiError(error);
    throw error; // handleGeminiError throws, but typescript needs this
  }
};

export const generatePromptIdeas = async (currentPrompt: string, instruction: string): Promise<string[]> => {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ 
    apiKey
  });
  
  const systemInstruction = `You are an expert AI image prompt engineer. 
  Your task is to generate 3 distinct, high-quality, and detailed image generation prompts based on the user's input.
  
  CRITICAL RULES FOR EVERY PROMPT:
  1. Every prompt MUST begin exactly with the phrase: "Subject(s) from the source photo depicted as, or transformed into"
  2. Every prompt MUST include the phrase: "Preserve exact facial identity from the source image and subtly enhance attractiveness"
  
  Output format: JSON Array of strings. Example: ["Subject(s) from the source photo depicted as, or transformed into...", "Subject(s) from the source photo depicted as, or transformed into...", "Subject(s) from the source photo depicted as, or transformed into..."]`;

  let userContent = "";
  if (currentPrompt.trim()) {
      userContent = `Original Prompt: "${currentPrompt}"\n\nTask: Rewrite or enhance the original prompt based on this instruction: "${instruction}".\nProvide 3 distinct variations (e.g., one realistic, one artistic, one creative interpretation).`;
  } else {
      userContent = `Task: Generate 3 creative image prompts based on this idea: "${instruction}".`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userContent,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini");
    
    // Parse JSON
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    return [];

  } catch (error: any) {
    handleGeminiError(error);
    return [];
  }
};

export const generatePromptMetadata = async (prompt: string): Promise<{name: string, description: string, tags: string[], category: string}> => {
  const apiKey = await resolveApiKey();
  const ai = new GoogleGenAI({ 
    apiKey
  });
  
  const systemInstruction = `You are an AI assistant that helps categorize and create metadata for image generation prompts.
Given an image generation prompt, you must return a suggested Title (name, 1-2 words, max 3), Description (a very brief, one-line phrase prompting the user), Category (a broad classification like Portrait, Landscape, Abstract, Cyberpunk, Cinematic, etc. Keep it to 1 word usually), and a list of Tags (2-5 relevant keywords).

Output format: JSON object with keys "name", "description", "category", "tags" (array of strings).`;

  const userContent = `Here is the image generation prompt:\n"${prompt}"\n\nPlease generate the title, description, category, and tags.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userContent,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (!text) throw new Error("No text returned from Gemini");
    
    // Parse JSON
    const parsed = JSON.parse(text);
    return {
        name: parsed.name || "",
        description: parsed.description || "",
        category: parsed.category || "General",
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };

  } catch (error: any) {
    console.error("Failed to generate metadata:", error);
    return { name: "", description: "", category: "General", tags: [] };
  }
};

const handleGeminiError = (error: any) => {
    console.error("Gemini API Error:", error);
    
    const errorMessage = error.message || "";
    
    // Handle leaked API key
    if (errorMessage.includes("leaked")) {
      throw new Error("API_KEY_LEAKED");
    }

    // Handle the specific "Requested entity was not found" error for API keys
    if (errorMessage.includes("Requested entity was not found")) {
      throw new Error("API_KEY_INVALID");
    }
    
    // Handle 403 Permission Denied
    if (error.status === 403 || errorMessage.includes("PERMISSION_DENIED")) {
      // If it's a Pro model, it's likely a billing or project permission issue
      throw new Error("API_KEY_PERMISSION_DENIED");
    }

    // Handle 429 Resource Exhausted (Quota exceeded)
    if (error.status === 429 || errorMessage.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("API_KEY_QUOTA_EXCEEDED");
    }

    // Handle other common API errors gracefully
    if (error.status === 400) {
      throw new Error(`Invalid request: ${errorMessage}`);
    }
    if (error.status === 503 || error.status === 500) {
      throw new Error("Service temporarily unavailable.");
    }
    
    throw error;
};

/**
 * Helper to check if a Gemini API key is selected.
 */
export const checkApiKeySelection = async (): Promise<boolean> => {
  return !!(import.meta.env.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || import.meta.env.GEMINI_API_KEY);
};

/**
 * Helper to prompt for a Gemini API key selection.
 */
export const promptForApiKey = async (): Promise<void> => {
  // In AI Studio, the platform handles key selection via UI.
  console.log("Please ensure a Gemini API key is configured in the Settings menu.");
};
