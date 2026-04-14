import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize, ModelType } from "../types";

declare global {
  interface Window {
    aistudio: {
      openSelectKey: () => Promise<void>;
      hasSelectedApiKey: () => Promise<boolean>;
    };
  }
}

export const promptForApiKey = async (): Promise<void> => {
  if (window.aistudio) {
    await window.aistudio.openSelectKey();
  } else {
    console.warn('window.aistudio not found');
  }
};

export const checkApiKeySelection = async (): Promise<boolean> => {
  if (window.aistudio) {
    return await window.aistudio.hasSelectedApiKey();
  }
  return false;
};

interface EditImageParams {
  imageBase64: string;
  mimeType: string;
  referenceImageBase64?: string | null;
  referenceMimeType?: string | null;
  refStrength?: number;
  prompt: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  model: ModelType;
}

export const generateEditedImage = async (params: EditImageParams): Promise<string> => {
  const { imageBase64, mimeType, referenceImageBase64, referenceMimeType, refStrength, prompt, aspectRatio, imageSize, model } = params;

  // For Pro and 3.1 Flash models, we must ensure an API key is selected if we are in the AI Studio environment
  if (model === ModelType.PRO || model === ModelType.FLASH_3_1) {
    const hasKey = await checkApiKeySelection();
    if (!hasKey) {
      await promptForApiKey();
      // After prompting, we check again. If still false, user might have cancelled.
      // But per guidelines, we proceed and let the API call fail with 401/403 if needed.
    }
  }

  // Initialize a new instance to ensure we capture the selected API key
  // process.env.API_KEY is automatically injected by the platform for both free and paid keys
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Build the content parts
  // Part 1: Source Image
  const parts: any[] = [
    {
      inlineData: {
        data: imageBase64,
        mimeType: mimeType,
      },
    }
  ];

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

  if (referenceImageBase64) {
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
  } else {
    // Single image case
    finalPrompt = `TASK: Edit the image based on the user prompt.
    
STRICT INSTRUCTION: Preserve the facial features and identity of the person in the image.

USER PROMPT: ${prompt}`;
  }

  parts.push({
    text: finalPrompt,
  });

  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts,
      },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: imageSize,
        },
      },
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
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const systemInstruction = `You are an expert AI image prompt engineer. 
  Your task is to generate 3 distinct, high-quality, and detailed image generation prompts based on the user's input.
  
  Output format: JSON Array of strings. Example: ["Prompt 1...", "Prompt 2...", "Prompt 3..."]`;

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
      throw new Error("Invalid request.");
    }
    if (error.status === 503 || error.status === 500) {
      throw new Error("Service temporarily unavailable.");
    }
    
    throw error;
};
