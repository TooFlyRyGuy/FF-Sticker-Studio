import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai@1.30.0";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { files, prompt, model, aspectRatio, imageSize, referenceImageBase64, referenceMimeType, refStrength } = body;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("VITE_SUPABASE_URL") || "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("VITE_SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: "Server not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = (Deno.env.get("NEWGEMINI_API_KEY") || Deno.env.get("GEMINI_API_KEY") || Deno.env.get("VITE_GEMINI_API_KEY") || "").trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No Gemini API key configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Create batch job
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

    // Process in the background using EdgeRuntime.waitUntil
    const processBatch = async () => {
      const genAI = new GoogleGenAI({ apiKey });
      let processed = 0;
      let failed = 0;
      const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");
      const processedImages: { name: string; data: Uint8Array }[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const parts: any[] = [];
          if (file.base64 && file.mimeType) {
            parts.push({ inlineData: { data: file.base64, mimeType: file.mimeType } });
          }
          if (referenceImageBase64 && referenceMimeType) {
            parts.push({ inlineData: { data: referenceImageBase64, mimeType: referenceMimeType } });
          }

          let finalPrompt = "";
          if (file.base64 && referenceImageBase64) {
            finalPrompt = `TASK: Edit the first image based on the user prompt, using the second image as a style reference.

STRICT INSTRUCTIONS FOR IMAGE PROCESSING:
1. IMAGE 1 (First Image) is the SOURCE SUBJECT. You MUST strictly preserve the facial features, identity, and physical likeness of the person in this image.
2. IMAGE 2 (Second Image) is the STYLE REFERENCE. Use this image ONLY for lighting, composition, color palette, and artistic style.
3. CRITICAL: DO NOT use the face, facial features, or identity from Image 2. IGNORE the identity of any person in Image 2.
4. DO NOT BLEND FACES. The resulting image must look exactly like the person in Image 1, but with the style of Image 2.

USER PROMPT: ${prompt}`;
            if (refStrength !== undefined) {
              finalPrompt += `\n\nSTYLE INFLUENCE SETTING: ${refStrength}/100.`;
            }
          } else if (file.base64) {
            finalPrompt = `TASK: Edit the image based on the user prompt.\n\nSTRICT INSTRUCTION: Preserve the facial features and identity of the person in the image.\n\nUSER PROMPT: ${prompt}`;
          } else {
            finalPrompt = prompt;
          }
          parts.push({ text: finalPrompt });

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
            failed++;
            continue;
          }

          let imageData: string | null = null;
          let imageMime = "image/png";
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                imageData = part.inlineData.data;
                imageMime = part.inlineData.mimeType || "image/png";
                break;
              }
            }
          }

          if (!imageData) {
            failed++;
            continue;
          }

          const fileExt = imageMime === "image/jpeg" ? "jpg" : imageMime === "image/webp" ? "webp" : "png";
          const imageName = `image-${String(i + 1).padStart(3, "0")}.${fileExt}`;

          // Convert base64 to Uint8Array for ZIP
          const binaryString = atob(imageData);
          const bytes = new Uint8Array(binaryString.length);
          for (let j = 0; j < binaryString.length; j++) {
            bytes[j] = binaryString.charCodeAt(j);
          }
          processedImages.push({ name: imageName, data: bytes });

          processed++;
          await supabaseAdmin.from("batch_jobs").update({
            processed_files: processed + failed,
            failed_files: failed,
          }).eq("id", jobId);

        } catch (err) {
          console.error(`[Batch ${jobId}] File ${i} failed:`, err);
          failed++;
          await supabaseAdmin.from("batch_jobs").update({
            processed_files: processed + failed,
            failed_files: failed,
          }).eq("id", jobId);
        }
      }

      // Build ZIP and upload
      if (processed > 0) {
        try {
          const zipData = buildZip(processedImages);
          const zipPath = `${jobId}/results.zip`;

          const { error: zipUploadError } = await supabaseAdmin.storage
            .from("batch-results")
            .upload(zipPath, zipData, {
              contentType: "application/zip",
              upsert: true,
            });

          if (zipUploadError) {
            console.error(`[Batch ${jobId}] ZIP upload failed:`, zipUploadError);
          }

          await supabaseAdmin.from("batch_jobs").update({
            status: "completed",
            processed_files: processed + failed,
            failed_files: failed,
            result_zip_path: zipPath,
          }).eq("id", jobId);

          console.log(`[Batch ${jobId}] Completed: ${processed} ok, ${failed} failed`);
        } catch (zipErr) {
          console.error(`[Batch ${jobId}] ZIP creation failed:`, zipErr);
          await supabaseAdmin.from("batch_jobs").update({
            status: "completed",
            processed_files: processed + failed,
            failed_files: failed,
            result_zip_path: null,
          }).eq("id", jobId);
        }
      } else {
        await supabaseAdmin.from("batch_jobs").update({
          status: "failed",
          processed_files: 0,
          failed_files: failed,
        }).eq("id", jobId);
        console.error(`[Batch ${jobId}] All ${failed} files failed`);
      }
    };

    // Use waitUntil for background processing
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(processBatch());
    } else {
      processBatch().catch(console.error);
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
