/**
 * Sticker output is a chroma-key plate, not a model-drawn "transparent" image.
 * Gemini image models do not emit a real alpha channel. Asking them for a
 * transparent background makes them paint an opaque checkerboard. Prompt Studio
 * keeps the author's prompt intact and appends a flat #00FF00 instruction,
 * then removes that green here.
 *
 * The shared gemini-generate function is not modified. Callers must not send a
 * stickerMode flag to it.
 */

export const STICKER_KEY_HEX = '#00FF00';

/** Appended after the author's prompt. The theme stays first and unmodified. */
export const STICKER_KEY_SCREEN_INSTRUCTION =
  'STICKER KEY SCREEN: one die-cut vinyl sticker of the subject, cropped close, thin white outline. The entire background must be flat pure green #00FF00, exactly RGB(0,255,0). No gradient, shadow, scene, frame, or photo overlay. Do not use a transparent background. Do not draw a checkerboard, grid, or grey-white squares. The green is a chroma-key screen and will be removed.';

const TRANSPARENT_SIGNAL = 40;
const OPAQUE_SIGNAL = 130;

export interface GeminiRequestFields {
  imageBase64?: string | null;
  mimeType?: string | null;
  referenceImages?: { base64: string; mimeType: string }[];
  refStrength?: number;
  prompt: string;
  aspectRatio: string;
  imageSize: string;
  model: string;
  stickerMode?: boolean;
}

/**
 * Build the gemini-generate `params` object.
 * Sticker mode appends the key-screen instruction after the author's prompt.
 * Every other field is copied through. stickerMode itself is not sent.
 */
export function buildGeminiGenerateParams(input: GeminiRequestFields): Omit<GeminiRequestFields, 'stickerMode'> {
  const { stickerMode, ...fields } = input;
  return {
    imageBase64: fields.imageBase64,
    mimeType: fields.mimeType,
    referenceImages: fields.referenceImages && fields.referenceImages.length > 0 ? fields.referenceImages : undefined,
    refStrength: fields.refStrength,
    prompt: stickerMode ? appendStickerKeyInstruction(fields.prompt) : fields.prompt,
    aspectRatio: fields.aspectRatio,
    imageSize: fields.imageSize,
    model: fields.model,
  };
}

/** Theme first. The key instruction follows. The author's text is not rewritten. */
export function appendStickerKeyInstruction(userPrompt: string): string {
  return `${userPrompt}\n\n${STICKER_KEY_SCREEN_INSTRUCTION}`;
}

export function stickerDownloadName(now: number): string {
  return `fun-frame-${now}.png`;
}

export interface ChromaKeyOptions {
  /** 1 pulls edge green all the way to a neutral (R+B)/2. */
  despill?: number;
  soften?: boolean;
  /** How many 1px passes eat green fringe. Default 2. */
  chokePasses?: number;
}

/**
 * Remove a pure-green screen from RGBA pixels.
 * Bright green becomes transparent. A 1-2px choke then eats the green rim
 * without deleting the white outline, and edge despill clears the green cast
 * on that outline. Fully removed pixels are stored as white RGB so a later
 * blur cannot revive a green halo.
 * Returns a new buffer. The input is not modified.
 */
export function keyChromaGreen(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ChromaKeyOptions = {}
): Uint8ClampedArray {
  const despill = options.despill ?? 1;
  const soften = options.soften ?? true;
  const chokePasses = options.chokePasses ?? 2;
  const out = new Uint8ClampedArray(rgba.length);
  const alphas = new Uint8Array(width * height);

  for (let p = 0; p < width * height; p++) {
    const i = p * 4;
    const keyed = stickerAlpha(rgba[i], rgba[i + 1], rgba[i + 2]);
    const srcAlpha = rgba[i + 3];
    alphas[p] = Math.round((keyed * srcAlpha) / 255);
    out[i] = rgba[i];
    out[i + 1] = rgba[i + 1];
    out[i + 2] = rgba[i + 2];
    out[i + 3] = alphas[p];
  }

  if (soften && width > 1 && height > 1) {
    softenAlpha(out, width, height);
    for (let p = 0; p < alphas.length; p++) alphas[p] = out[p * 4 + 3];
  }

  for (let pass = 0; pass < chokePasses; pass++) {
    chokeGreenFringe(out, alphas, width, height);
  }

  if (despill > 0) {
    despillEdges(out, width, height, despill);
  }

  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) {
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
    }
  }

  return out;
}

export function stickerAlpha(r: number, g: number, b: number): number {
  const brightScreen = g >= 170 && r <= 110 && b <= 110 && g >= r + 60 && g >= b + 60;
  const signal = brightScreen
    ? Math.max(r, b) * 0.85 + (255 - g) * 0.55
    : Math.sqrt(r * r + (g - 255) * (g - 255) + b * b);

  if (signal <= TRANSPARENT_SIGNAL) return 0;
  if (signal >= OPAQUE_SIGNAL) return 255;
  const t = (signal - TRANSPARENT_SIGNAL) / (OPAQUE_SIGNAL - TRANSPARENT_SIGNAL);
  const smooth = t * t * (3 - 2 * t);
  return Math.round(smooth * 255);
}

/** Green rim pixels, not a white outline that merely picked up a little spill. */
function isGreenFringe(r: number, g: number, b: number): boolean {
  return g >= 150 && r <= 170 && b <= 170 && g >= r + 35 && g >= b + 35;
}

function chokeGreenFringe(
  rgba: Uint8ClampedArray,
  alphas: Uint8Array,
  width: number,
  height: number
): void {
  const next = new Uint8Array(alphas);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      if (alphas[p] >= 255) continue;
      if (!isGreenFringe(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
      let minA = alphas[p];
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = alphas[ny * width + nx];
          if (neighbor < minA) minA = neighbor;
        }
      }
      next[p] = minA;
    }
  }
  for (let p = 0; p < next.length; p++) {
    alphas[p] = next[p];
    rgba[p * 4 + 3] = next[p];
  }
}

function despillEdges(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  despill: number
): void {
  const count = width * height;
  const near = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      if (alpha >= 250) continue;
      for (let dy = -3; dy <= 3; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -3; dx <= 3; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          near[ny * width + nx] = 1;
        }
      }
    }
  }

  const strength = Math.min(1, despill);
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (rgba[i + 3] === 0) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const maxRB = Math.max(r, b);
    const excess = g - maxRB;
    if (excess <= 0) continue;
    // A white outline keeps a green cast a few pixels in from the cut.
    // Light pixels with a small excess are that cast. Saturated green
    // (a costume) stays unless it is on the cut edge.
    const lightCast = Math.min(r, b) >= 175 && excess <= 60;
    if (!near[p] && !lightCast) continue;
    const neutral = (r + b) / 2;
    rgba[i + 1] = Math.round(g + (neutral - g) * strength);
  }
}

function softenAlpha(rgba: Uint8ClampedArray, width: number, height: number): void {
  const alphas = new Uint8Array(width * height);
  for (let i = 0; i < alphas.length; i++) {
    alphas[i] = rgba[i * 4 + 3];
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += alphas[ny * width + nx];
          count++;
        }
      }
      rgba[(y * width + x) * 4 + 3] = Math.round(sum / count);
    }
  }
}
