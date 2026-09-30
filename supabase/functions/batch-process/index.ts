import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai@1.30.0";
import { PNG } from "npm:pngjs@7";
import * as jpeg from "npm:jpeg-js@0.4.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function crc32(buf: Uint8Array): number {
  let table: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;
  const records: { name: string; offset: number; size: number; crc: number }[] = [];

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array(30);
    const dv = new DataView(localHeader.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);

    chunks.push(localHeader, nameBytes, file.data);
    records.push({ name: file.name, offset, size, crc });
    offset += 30 + nameBytes.length + size;
  }

  let cdSize = 0;
  for (const rec of records) {
    const nameBytes = new TextEncoder().encode(rec.name);
    const cdRecord = new Uint8Array(46);
    const dv = new DataView(cdRecord.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, rec.crc, true);
    dv.setUint32(20, rec.size, true);
    dv.setUint32(24, rec.size, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, rec.offset, true);

    centralDir.push(cdRecord, nameBytes);
    cdSize += 46 + nameBytes.length;
  }

  const eocd = new Uint8Array(22);
  const eocdDv = new DataView(eocd.buffer);
  eocdDv.setUint32(0, 0x06054b50, true);
  eocdDv.setUint16(4, 0, true);
  eocdDv.setUint16(6, 0, true);
  eocdDv.setUint16(8, records.length, true);
  eocdDv.setUint16(10, records.length, true);
  eocdDv.setUint32(12, cdSize, true);
  eocdDv.setUint32(16, offset, true);
  eocdDv.setUint16(20, 0, true);

  const totalLength = chunks.reduce((s, c) => s + c.length, 0) + centralDir.reduce((s, c) => s + c.length, 0) + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const c of chunks) { result.set(c, pos); pos += c.length; }
  for (const c of centralDir) { result.set(c, pos); pos += c.length; }
  result.set(eocd, pos);
  return result;
}

async function logFile(supabaseAdmin: any, jobId: string, fileName: string, status: string, reason?: string, outputFileName?: string) {
  await supabaseAdmin.from("batch_job_logs").insert([{
    batch_job_id: jobId,
    file_name: fileName,
    status,
    reason: reason || null,
    output_file_name: outputFileName || null,
  }]);
}

interface RefImage {
  base64: string;
  mimeType: string;
}

function buildPromptForFile(file: any, prompt: string, referenceImages: RefImage[], refStrength?: number): string {
  if (file.base64 && referenceImages.length > 0) {
    const refCount = referenceImages.length;
    const refLabels = referenceImages.map((_, i) => `Image ${i + 2}`).join(", ");
    let finalPrompt = `You are given ${refCount + 1} images and a text prompt.

CRITICAL IMAGE ORDERING — READ CAREFULLY:
- Image 1 (sent FIRST in this request) is the SOURCE PHOTO. This is the ONLY person/subject you are editing. You MUST preserve their face, identity, facial features, body shape, skin tone, and likeness exactly. This is non-negotiable and always takes priority over everything else.
- ${refLabels} (sent AFTER the source photo) ${refCount === 1 ? "is a REFERENCE IMAGE" : "are REFERENCE IMAGES"}. Use ${refCount === 1 ? "it" : "them"} ONLY for lighting, color grading, mood, composition, texture, and artistic direction.
- UNDER NO CIRCUMSTANCES should the output contain any facial features, face shape, skin tone, hairstyle, expression, or identity from the reference image(s). The reference is for lighting, color, and atmosphere ONLY.
- DO NOT blend faces. DO NOT transfer any facial feature from the reference. DO NOT use any reference image's identity. If you cannot determine which image is the source, ALWAYS default to the FIRST image provided.
- The output must clearly show Image 1's person, influenced by the reference image(s) style only.

USER PROMPT: ${prompt}`;
    if (refStrength !== undefined) {
      finalPrompt += `\n\nREFERENCE INFLUENCE: ${refStrength}/100. Apply this strength to the reference influence (lighting, colors, texture) only. Identity preservation of Image 1 is always 100/100 regardless of this setting.`;
    }
    return finalPrompt;
  } else if (file.base64) {
    return `Edit the provided image according to the user prompt. Preserve the person's face, identity, and likeness.\n\nUSER PROMPT: ${prompt}`;
  }
  return prompt;
}

function buildPartsForFile(file: any, referenceImages: RefImage[]): any[] {
  const parts: any[] = [];
  if (file.base64 && file.mimeType) {
    parts.push({ inlineData: { data: file.base64, mimeType: file.mimeType } });
  }
  for (const ref of referenceImages) {
    parts.push({ inlineData: { data: ref.base64, mimeType: ref.mimeType } });
  }
  return parts;
}

function classifyError(err: any): string {
  if (!err?.message) return "Unexpected error during processing.";
  const msg = err.message;
  if (msg.includes("timeout") || msg.includes("deadline")) return "The request timed out — the model took too long to respond.";
  if (msg.includes("quota") || msg.includes("rate")) return "API rate limit or quota exceeded.";
  if (msg.includes("429")) return "Too many requests — rate limit hit.";
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) return "Gemini server error — the model was temporarily unavailable.";
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("PROHIBITED")) return "Image blocked by safety filters.";
  return msg.substring(0, 300);
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let j = 0; j < binaryString.length; j++) bytes[j] = binaryString.charCodeAt(j);
  return bytes;
}

function decodeImage(bytes: Uint8Array, mimeType: string): { width: number; height: number; data: Buffer } | null {
  try {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      const raw = jpeg.decode(bytes, { maxResolutionInDP: 4096 });
      return { width: raw.width, height: raw.height, data: raw.data };
    }
    // Default: try PNG
    const png = PNG.sync.read(bytes);
    return { width: png.width, height: png.height, data: png.data };
  } catch (e) {
    console.error("Failed to decode image for overlay:", e);
    return null;
  }
}

function compositeOverlayOnImage(baseBytes: Uint8Array, baseMime: string, overlayBytes: Uint8Array, overlayMime: string): Uint8Array {
  const base = decodeImage(baseBytes, baseMime);
  const overlay = decodeImage(overlayBytes, overlayMime);
  if (!base || !overlay) return baseBytes;

  // Scale overlay to cover base image (simple nearest-neighbor)
  const result = PNG.sync.read(baseBytes);
  const baseData = result.data;
  const overlayData = overlay.data;

  for (let y = 0; y < result.height; y++) {
    const srcY = Math.floor(y * overlay.height / result.height);
    for (let x = 0; x < result.width; x++) {
      const srcX = Math.floor(x * overlay.width / result.width);
      const baseIdx = (y * result.width + x) * 4;
      const overlayIdx = (srcY * overlay.width + srcX) * 4;

      const alpha = overlayData[overlayIdx + 3] / 255;
      if (alpha === 0) continue;

      baseData[baseIdx] = Math.round(baseData[baseIdx] * (1 - alpha) + overlayData[overlayIdx] * alpha);
      baseData[baseIdx + 1] = Math.round(baseData[baseIdx + 1] * (1 - alpha) + overlayData[overlayIdx + 1] * alpha);
      baseData[baseIdx + 2] = Math.round(baseData[baseIdx + 2] * (1 - alpha) + overlayData[overlayIdx + 2] * alpha);
      // Keep base alpha (255 for opaque images)
    }
  }

  return PNG.sync.write({ width: result.width, height: result.height, data: baseData });
}

function extractImageFromResponse(response: any): { data: string; mime: string } | null {
  const candidate = response?.candidates?.[0];
  if (!candidate) return null;
  if (candidate.content?.parts) {
    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return { data: part.inlineData.data, mime: part.inlineData.mimeType || "image/png" };
      }
    }
  }
  return null;
}

async function finalizeJob(supabaseAdmin: any, jobId: string, processed: number, failed: number, processedImages: { name: string; data: Uint8Array }[], totalFiles: number) {
  if (processed > 0) {
    let zipUploaded = false;
    let zipPath: string | null = null;
    try {
      const zipData = buildZip(processedImages);
      zipPath = `${jobId}/results.zip`;
      const { error: zipUploadError } = await supabaseAdmin.storage
        .from("batch-results")
        .upload(zipPath, zipData, { contentType: "application/zip", upsert: true });
      if (zipUploadError) {
        console.error(`[Batch ${jobId}] ZIP upload failed:`, zipUploadError);
        zipPath = null;
      } else {
        zipUploaded = true;
      }
    } catch (zipErr) {
      console.error(`[Batch ${jobId}] ZIP creation failed:`, zipErr);
      zipPath = null;
    }

    if (zipUploaded && zipPath) {
      await supabaseAdmin.from("batch_jobs").update({
        status: "completed",
        processed_files: processed + failed,
        failed_files: failed,
        result_zip_path: zipPath,
        error_message: failed > 0 ? `${failed} image(s) failed processing` : null,
      }).eq("id", jobId);
    } else {
      await supabaseAdmin.from("batch_jobs").update({
        status: "completed",
        processed_files: processed + failed,
        failed_files: failed,
        result_zip_path: null,
        error_message: `Images processed (${processed} succeeded, ${failed} failed) but the download file could not be created. Check the details view for per-file results.`,
      }).eq("id", jobId);
    }
  } else {
    let topReason = "All images failed to process.";
    try {
      const { data: failLogs } = await supabaseAdmin
        .from("batch_job_logs")
        .select("reason")
        .eq("batch_job_id", jobId)
        .eq("status", "failed");
      if (failLogs && failLogs.length > 0) {
        const reasonCounts: Record<string, number> = {};
        for (const log of failLogs) {
          const r = log.reason || "Unknown error";
          reasonCounts[r] = (reasonCounts[r] || 0) + 1;
        }
        const top = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0];
        if (top) {
          topReason = top[1] === failLogs.length
            ? `All ${failed} images failed: ${top[0]}`
            : `All ${failed} images failed — most common reason: ${top[0].substring(0, 150)}`;
        }
      }
    } catch { /* use generic */ }

    await supabaseAdmin.from("batch_jobs").update({
      status: "failed",
      processed_files: 0,
      failed_files: failed,
      error_message: topReason,
    }).eq("id", jobId);
  }
}

// --- Sequential processing (fallback) ---
async function processSequential(
  genAI: any, supabaseAdmin: any, jobId: string,
  files: any[], prompt: string, model: string, aspectRatio: string,
  imageSize: string, referenceImages: RefImage[], refStrength?: number,
  overlayImage?: RefImage | null
) {
  const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");
  let processed = 0;
  let failed = 0;
  const processedImages: { name: string; data: Uint8Array }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = file.name || `image-${String(i + 1).padStart(3, "0")}`;
    try {
      const parts = buildPartsForFile(file, referenceImages);
      const finalPrompt = buildPromptForFile(file, prompt, referenceImages, refStrength);
      parts.push({ text: finalPrompt });

      const configData: any = { imageConfig: { aspectRatio } };
      if (isHighFidelity && imageSize) configData.imageConfig.imageSize = imageSize;

      const response = await genAI.models.generateContent({ model, contents: { parts }, config: configData });
      const img = extractImageFromResponse(response);

      if (!img) {
        const textPart = response?.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
        const reason = textPart?.text
          ? `Model returned text instead of an image: "${textPart.text.substring(0, 200)}"`
          : "Model returned a response with no image data.";
        failed++;
        await logFile(supabaseAdmin, jobId, fileName, "failed", reason);
        await supabaseAdmin.from("batch_jobs").update({ processed_files: processed + failed, failed_files: failed }).eq("id", jobId);
        continue;
      }

      const fileExt = overlayImage ? "png" : (img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png");
      const imageName = `image-${String(i + 1).padStart(3, "0")}.${fileExt}`;
      let imageBytes = base64ToBytes(img.data);
      if (overlayImage) {
        const overlayBytes = base64ToBytes(overlayImage.base64);
        imageBytes = compositeOverlayOnImage(imageBytes, img.mime, overlayBytes, overlayImage.mimeType);
      }
      processedImages.push({ name: imageName, data: imageBytes });
      processed++;
      await logFile(supabaseAdmin, jobId, fileName, "succeeded", undefined, imageName);
      await supabaseAdmin.from("batch_jobs").update({ processed_files: processed + failed, failed_files: failed }).eq("id", jobId);
    } catch (err: any) {
      const reason = classifyError(err);
      console.error(`[Batch ${jobId}] File ${i} (${fileName}) failed:`, err);
      failed++;
      await logFile(supabaseAdmin, jobId, fileName, "failed", reason);
      await supabaseAdmin.from("batch_jobs").update({ processed_files: processed + failed, failed_files: failed }).eq("id", jobId);
    }
  }

  await finalizeJob(supabaseAdmin, jobId, processed, failed, processedImages, files.length);
}

// --- Google Batch API processing ---
async function processViaBatchApi(
  genAI: any, supabaseAdmin: any, jobId: string,
  files: any[], prompt: string, model: string, aspectRatio: string,
  imageSize: string, referenceImages: RefImage[], refStrength?: number,
  overlayImage?: RefImage | null
): Promise<boolean> {
  const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");
  const inlinedRequests: any[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parts = buildPartsForFile(file, referenceImages);
    const finalPrompt = buildPromptForFile(file, prompt, referenceImages, refStrength);
    parts.push({ text: finalPrompt });

    const configData: any = { imageConfig: { aspectRatio } };
    if (isHighFidelity && imageSize) configData.imageConfig.imageSize = imageSize;

    inlinedRequests.push({
      contents: [{ role: "user", parts }],
      config: configData,
    });
  }

  let batchJob: any;
  try {
    batchJob = await genAI.batches.create({
      model,
      src: inlinedRequests,
      config: { displayName: `batch-${jobId.substring(0, 8)}` },
    });
  } catch (batchErr: any) {
    console.error(`[Batch ${jobId}] Google Batch API submission failed, falling back to sequential:`, batchErr);
    return false;
  }

  const geminiBatchName = batchJob?.name;
  if (!geminiBatchName) {
    console.error(`[Batch ${jobId}] Google Batch API returned no job name, falling back to sequential`);
    return false;
  }

  console.log(`[Batch ${jobId}] Submitted to Google Batch API as ${geminiBatchName}`);
  await supabaseAdmin.from("batch_jobs").update({
    gemini_batch_name: geminiBatchName,
    batch_api_state: batchJob.state?.name || "JOB_STATE_PENDING",
  }).eq("id", jobId);

  // Poll until terminal state
  const pollIntervalMs = 15000;
  let currentState = batchJob.state?.name || "JOB_STATE_PENDING";

  while (true) {
    if (currentState === "JOB_STATE_SUCCEEDED") break;
    if (currentState === "JOB_STATE_FAILED" || currentState === "JOB_STATE_CANCELLED" || currentState === "JOB_STATE_EXPIRED") break;

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

    try {
      const updated = await genAI.batches.get({ name: geminiBatchName });
      currentState = updated.state?.name || "JOB_STATE_PENDING";
      await supabaseAdmin.from("batch_jobs").update({ batch_api_state: currentState }).eq("id", jobId);
      console.log(`[Batch ${jobId}] Google Batch API state: ${currentState}`);
    } catch (pollErr: any) {
      console.error(`[Batch ${jobId}] Error polling Google Batch API:`, pollErr);
    }
  }

  if (currentState !== "JOB_STATE_SUCCEEDED") {
    console.error(`[Batch ${jobId}] Google Batch API ended in state ${currentState}`);
    return false;
  }

  // Fetch the completed batch job to get results
  const completedJob = await genAI.batches.get({ name: geminiBatchName });
  const inlinedResponses = completedJob?.dest?.inlinedResponses;

  if (!inlinedResponses || !Array.isArray(inlinedResponses)) {
    console.error(`[Batch ${jobId}] No inlinedResponses in completed batch job`);
    return false;
  }

  let processed = 0;
  let failed = 0;
  const processedImages: { name: string; data: Uint8Array }[] = [];

  for (let i = 0; i < inlinedResponses.length; i++) {
    const resp = inlinedResponses[i];
    const fileName = files[i]?.name || `image-${String(i + 1).padStart(3, "0")}`;

    try {
      if (resp?.error) {
        failed++;
        await logFile(supabaseAdmin, jobId, fileName, "failed", `Batch API error: ${JSON.stringify(resp.error).substring(0, 300)}`);
        continue;
      }

      const img = extractImageFromResponse(resp?.response);
      if (!img) {
        failed++;
        await logFile(supabaseAdmin, jobId, fileName, "failed", "Model returned no image data in batch response.");
        continue;
      }

      const fileExt = overlayImage ? "png" : (img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png");
      const imageName = `image-${String(i + 1).padStart(3, "0")}.${fileExt}`;
      let imageBytes = base64ToBytes(img.data);
      if (overlayImage) {
        const overlayBytes = base64ToBytes(overlayImage.base64);
        imageBytes = compositeOverlayOnImage(imageBytes, img.mime, overlayBytes, overlayImage.mimeType);
      }
      processedImages.push({ name: imageName, data: imageBytes });
      processed++;
      await logFile(supabaseAdmin, jobId, fileName, "succeeded", undefined, imageName);
    } catch (err: any) {
      failed++;
      await logFile(supabaseAdmin, jobId, fileName, "failed", classifyError(err));
    }
  }

  await supabaseAdmin.from("batch_jobs").update({
    processed_files: processed + failed,
    failed_files: failed,
    batch_api_state: "JOB_STATE_SUCCEEDED",
  }).eq("id", jobId);

  await finalizeJob(supabaseAdmin, jobId, processed, failed, processedImages, files.length);
  return true;
}

// --- Polling route: check Google Batch API status ---
async function handlePollRoute(req: Request, supabaseAdmin: any, apiKey: string) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId");
  if (!jobId) {
    return new Response(JSON.stringify({ error: "Missing jobId parameter." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: job, error } = await supabaseAdmin
    .from("batch_jobs")
    .select("id, status, gemini_batch_name, batch_api_state, processed_files, failed_files, total_files")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !job) {
    return new Response(JSON.stringify({ error: "Job not found." }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // If no Gemini batch name, this is a sequential job — just return current status
  if (!job.gemini_batch_name) {
    return new Response(JSON.stringify({
      jobId,
      status: job.status,
      batchApiState: null,
      processed: job.processed_files,
      failed: job.failed_files,
      total: job.total_files,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // If already completed/failed, don't re-poll Google
  if (job.status === "completed" || job.status === "failed") {
    return new Response(JSON.stringify({
      jobId,
      status: job.status,
      batchApiState: job.batch_api_state,
      processed: job.processed_files,
      failed: job.failed_files,
      total: job.total_files,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Poll Google Batch API
  const genAI = new GoogleGenAI({ apiKey });
  let googleState = job.batch_api_state || "JOB_STATE_PENDING";

  try {
    const batchJob = await genAI.batches.get({ name: job.gemini_batch_name });
    googleState = batchJob.state?.name || googleState;

    await supabaseAdmin.from("batch_jobs").update({ batch_api_state: googleState }).eq("id", jobId);

    if (googleState === "JOB_STATE_SUCCEEDED") {
      // Extract results
      const inlinedResponses = batchJob?.dest?.inlinedResponses;
      if (!inlinedResponses || !Array.isArray(inlinedResponses)) {
        return new Response(JSON.stringify({
          jobId, status: "processing", batchApiState: googleState,
          processed: job.processed_files, failed: job.failed_files, total: job.total_files,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Fetch the original files metadata from the job
      const { data: fullJob } = await supabaseAdmin
        .from("batch_jobs")
        .select("prompt_text, model, aspect_ratio, image_size")
        .eq("id", jobId)
        .maybeSingle();

      let processed = 0;
      let failed = 0;
      const processedImages: { name: string; data: Uint8Array }[] = [];

      // Clear old logs for this job to avoid duplicates
      await supabaseAdmin.from("batch_job_logs").delete().eq("batch_job_id", jobId);

      for (let i = 0; i < inlinedResponses.length; i++) {
        const resp = inlinedResponses[i];
        const fileName = `image-${String(i + 1).padStart(3, "0")}`;

        try {
          if (resp?.error) {
            failed++;
            await logFile(supabaseAdmin, jobId, fileName, "failed", `Batch API error: ${JSON.stringify(resp.error).substring(0, 300)}`);
            continue;
          }

          const img = extractImageFromResponse(resp?.response);
          if (!img) {
            failed++;
            await logFile(supabaseAdmin, jobId, fileName, "failed", "Model returned no image data in batch response.");
            continue;
          }

          const fileExt = img.mime === "image/jpeg" ? "jpg" : img.mime === "image/webp" ? "webp" : "png";
          const imageName = `image-${String(i + 1).padStart(3, "0")}.${fileExt}`;
          processedImages.push({ name: imageName, data: base64ToBytes(img.data) });
          processed++;
          await logFile(supabaseAdmin, jobId, fileName, "succeeded", undefined, imageName);
        } catch (err: any) {
          failed++;
          await logFile(supabaseAdmin, jobId, fileName, "failed", classifyError(err));
        }
      }

      await supabaseAdmin.from("batch_jobs").update({
        processed_files: processed + failed,
        failed_files: failed,
        batch_api_state: "JOB_STATE_SUCCEEDED",
      }).eq("id", jobId);

      await finalizeJob(supabaseAdmin, jobId, processed, failed, processedImages, inlinedResponses.length);

      return new Response(JSON.stringify({
        jobId, status: "completed", batchApiState: "JOB_STATE_SUCCEEDED",
        processed: processed + failed, failed, total: inlinedResponses.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (googleState === "JOB_STATE_FAILED" || googleState === "JOB_STATE_CANCELLED" || googleState === "JOB_STATE_EXPIRED") {
      const reason = `Google Batch API job ${googleState.replace("JOB_STATE_", "").toLowerCase()}.`;
      await supabaseAdmin.from("batch_jobs").update({
        status: "failed",
        batch_api_state: googleState,
        error_message: `Batch processing failed: ${reason}`,
      }).eq("id", jobId);

      return new Response(JSON.stringify({
        jobId, status: "failed", batchApiState: googleState,
        processed: job.processed_files, failed: job.failed_files, total: job.total_files,
        error: reason,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Still running
    return new Response(JSON.stringify({
      jobId, status: "processing", batchApiState: googleState,
      processed: job.processed_files, failed: job.failed_files, total: job.total_files,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (pollErr: any) {
    console.error(`[Batch ${jobId}] Poll route error:`, pollErr);
    return new Response(JSON.stringify({
      jobId, status: "processing", batchApiState: googleState,
      processed: job.processed_files, failed: job.failed_files, total: job.total_files,
      error: "Failed to poll batch status, will retry.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") || "";
  const apiKey = (Deno.env.get("NEWGEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY") || "").trim();

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: "Server not configured." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "No Gemini API key configured." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  // --- GET route: poll Google Batch API status ---
  if (req.method === "GET") {
    return await handlePollRoute(req, supabaseAdmin, apiKey);
  }

  // --- POST route: submit a new batch ---
  try {
    const body = await req.json();
    const { files, prompt, model, aspectRatio, imageSize, referenceImages, refStrength, overlayImage } = body;

    const refs: RefImage[] = Array.isArray(referenceImages)
      ? referenceImages.filter((r: RefImage) => r.base64 && r.mimeType)
      : [];

    const overlay: RefImage | null = overlayImage && overlayImage.base64 && overlayImage.mimeType
      ? { base64: overlayImage.base64, mimeType: overlayImage.mimeType }
      : null;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return new Response(JSON.stringify({ error: "No files provided." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "No prompt provided." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: jobRow, error: jobError } = await supabaseAdmin
      .from("batch_jobs")
      .insert([{
        status: "processing",
        total_files: files.length,
        processed_files: 0,
        failed_files: 0,
        prompt_text: prompt,
        model,
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      }])
      .select("id")
      .single();

    if (jobError || !jobRow) {
      return new Response(JSON.stringify({ error: "Failed to create batch job" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const jobId = jobRow.id;
    const genAI = new GoogleGenAI({ apiKey });

    const processBatch = async () => {
      // Try Google Batch API first
      const batchSuccess = await processViaBatchApi(
        genAI, supabaseAdmin, jobId,
        files, prompt, model, aspectRatio, imageSize,
        refs, refStrength, overlay
      );

      if (!batchSuccess) {
        // Fallback to sequential processing
        console.log(`[Batch ${jobId}] Falling back to sequential processing`);
        await supabaseAdmin.from("batch_jobs").update({
          gemini_batch_name: null,
          batch_api_state: null,
        }).eq("id", jobId);
        await processSequential(
          genAI, supabaseAdmin, jobId,
          files, prompt, model, aspectRatio, imageSize,
          refs, refStrength, overlay
        );
      }
    };

    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(processBatch().catch(async (err) => {
        console.error(`[Batch ${jobId}] Background processing crashed:`, err);
        try {
          await supabaseAdmin.from("batch_jobs").update({
            status: "failed",
            error_message: "Batch processing stopped unexpectedly due to a server error. Please try again.",
          }).eq("id", jobId);
        } catch { /* best-effort */ }
      }));
    } else {
      processBatch().catch(async (err) => {
        console.error(`[Batch ${jobId}] Background processing crashed:`, err);
        try {
          await supabaseAdmin.from("batch_jobs").update({
            status: "failed",
            error_message: "Batch processing stopped unexpectedly due to a server error. Please try again.",
          }).eq("id", jobId);
        } catch { /* best-effort */ }
      });
    }

    return new Response(JSON.stringify({ jobId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[Batch] Error:", err);
    return new Response(JSON.stringify({ error: "Failed to start batch" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
