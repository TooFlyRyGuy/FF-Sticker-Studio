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

  const response = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      params: {
        imageBase64,
        mimeType,
        referenceImageBase64,
        referenceMimeType,
        refStrength,
        prompt,
        aspectRatio,
        imageSize,
        model
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || `Server error: ${response.status}`);
  }

  const result = await response.json();
  return `data:${result.mimeType};base64,${result.data}`;
};

export const generatePromptIdeas = async (currentPrompt: string, instruction: string): Promise<string[]> => {
  try {
    const response = await fetch('/api/gemini/ideas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPrompt, instruction }),
    });

    if (!response.ok) throw new Error("Failed to fetch ideas from server");

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    // Parse the text from the server response (which is a JSON string from Gemini)
    const parsed = JSON.parse(data.text);
    if (Array.isArray(parsed)) {
      return parsed.map(String);
    }
    return [];
  } catch (error: any) {
    console.error("Failed to generate ideas:", error);
    return [];
  }
};

export const generatePromptMetadata = async (prompt: string): Promise<{name: string, description: string, tags: string[], category: string}> => {
  try {
    const response = await fetch('/api/gemini/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) throw new Error("Failed to fetch metadata from server");

    const data = await response.json();
    const parsed = JSON.parse(data.text);
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
    // ... (rest of handleGeminiError logic if still needed, but backend handles most now)
};

/**
 * Helper to check if a Gemini API key is selected.
 */
export const checkApiKeySelection = async (): Promise<boolean> => {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    return !!data.hasKey;
  } catch (e) {
    return false;
  }
};

/**
 * Helper to prompt for a Gemini API key selection.
 */
export const promptForApiKey = async (): Promise<void> => {
  // In AI Studio, the platform handles key selection via UI.
  console.log("Please ensure a Gemini API key is configured in the Settings menu.");
};
