import { AspectRatio, ImageSize, ModelType } from "../types";

interface RefImageData {
  base64: string;
  mimeType: string;
}

interface EditImageParams {
  imageBase64?: string | null;
  mimeType?: string | null;
  referenceImages?: RefImageData[];
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
      return { data, mime: defaultMime };
    }
  }
  return { data, mime: defaultMime };
};

const getEdgeFunctionUrl = (): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  return `${supabaseUrl}/functions/v1/gemini-generate`;
};

const getAuthHeaders = (): Record<string, string> => {
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseAnonKey}`,
    'apikey': supabaseAnonKey,
  };
};

export const generateEditedImage = async (params: EditImageParams): Promise<string> => {
  let { imageBase64, mimeType, referenceImages, refStrength, prompt, aspectRatio, imageSize, model } = params;

  if (imageBase64) {
    const result = await ensureBase64(imageBase64, mimeType || 'image/png');
    imageBase64 = result.data;
    mimeType = result.mime;
  }

  const processedRefs: RefImageData[] = [];
  if (referenceImages && referenceImages.length > 0) {
    for (const ref of referenceImages) {
      const result = await ensureBase64(ref.base64, ref.mimeType || 'image/png');
      processedRefs.push({ base64: result.data, mimeType: result.mime });
    }
  }

  const response = await fetch(getEdgeFunctionUrl(), {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      params: {
        imageBase64,
        mimeType,
        referenceImages: processedRefs.length > 0 ? processedRefs : undefined,
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
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${supabaseUrl}/functions/v1/prompt-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ currentPrompt, instruction }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${response.status})`);
    }

    const data = await response.json();
    if (data.error) throw new Error(data.error);

    const parsed = JSON.parse(data.text);
    const prompts = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.prompts) ? parsed.prompts : []);
    return prompts.map(String);
  } catch (error: any) {
    console.error("Failed to generate ideas:", error);
    return [];
  }
};

export const generatePromptMetadata = async (prompt: string): Promise<{name: string, description: string, tags: string[], category: string}> => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${supabaseUrl}/functions/v1/gemini-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({ type: 'metadata', prompt }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Request failed (${response.status})`);
    }

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

export const checkApiKeySelection = async (): Promise<boolean> => {
  try {
    const res = await fetch(getEdgeFunctionUrl(), {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    return !!data.hasKey;
  } catch (e) {
    return false;
  }
};

export const promptForApiKey = async (): Promise<void> => {
  console.log("The Gemini API key is configured server-side in Supabase Secrets. No client-side key selection needed.");
};
