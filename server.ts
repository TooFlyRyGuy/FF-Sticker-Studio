import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import process from "process";
import OpenAI from "openai";

import { GoogleGenAI } from "@google/genai";
import { createClient } from '@supabase/supabase-js';

async function startServer() {
  const app = express();
  const PORT = 3000;

  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ufbjphmsblgwzkofpgai.supabase.co';
  const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Ha-_7AikIAhQ9_8-T19HGw_jU2ePTSP';
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

  app.use(express.json({ limit: '100mb' }));

  // Endpoint to vend configuration to the frontend (REDACTED API KEY)
  app.get("/api/config", (req, res) => {
    res.json({ 
      hasKey: !!(process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY)
    });
  });

  // Proxy Gemini API calls to the server to prevent key exposure
  app.post("/api/gemini/generate", async (req, res) => {
    const { params } = req.body;
    const { imageBase64, mimeType, referenceImageBase64, referenceMimeType, refStrength, prompt, aspectRatio, imageSize, model } = params;

    const apiKey = (process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "No API key configured on server." });
    }

    console.log(`[Gemini Generate] Starting request with model: ${model}`);
    const startTime = Date.now();

    try {
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
      const configData: any = {
        imageConfig: { aspectRatio },
      };
      if (isHighFidelity && imageSize) {
        configData.imageConfig.imageSize = imageSize;
      }

      const response = await genAI.models.generateContent({
        model: model,
        contents: { parts },
        config: configData,
      });

      const candidate = response.candidates?.[0];
      if (!candidate) {
        return res.status(400).json({ error: "No candidate returned. The prompt may have were blocked." });
      }

      if (candidate.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData && part.inlineData.data) {
            const duration = Date.now() - startTime;
            console.log(`[Gemini Generate] Successfully generated image with model: ${model} in ${duration}ms`);
            return res.json({ 
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'image/png'
            });
          }
        }
      }

      const textPart = candidate.content?.parts?.find(p => p.text);
      if (textPart && textPart.text) {
        return res.status(400).json({ error: `Model Refused: ${textPart.text}` });
      }

      return res.status(500).json({ error: "No image data found in response." });

    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`[Gemini Generate] Error after ${duration}ms with model: ${model}`, error);
      res.status(error.status || 500).json({ 
        error: error.message || "Internal server error" 
      });
    }
  });

  // Ideas endpoint
  app.post("/api/gemini/ideas", async (req, res) => {
    const { currentPrompt, instruction } = req.body;
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    
    if (!apiKey) {
      console.error("[OpenAI] API key is missing");
      return res.status(500).json({ error: "OpenAI API key is not configured." });
    }
    
    console.log("[OpenAI] Initializing with key prefix:", apiKey.substring(0, 5) + "...");
    
    try {
      const openai = new OpenAI({ 
        apiKey,
        baseURL: "https://api.openai.com/v1"
      });
      const systemInstruction = `You are an expert AI image prompt engineer. 
      Your task is to generate 3 distinct, high-quality, and highly detailed image generation prompts based on the user's input.
      
      GUIDELINES FOR EVERY PROMPT:
      1. COMPREHENSIVE DETAIL: Write extremely rich, descriptive, and lengthy prompts. Do not be brief. Elaborate on every aspect of the scene, including lighting, camera specs, atmosphere, texture, and material details.
      2. PRESERVATION: Heavily incorporate and retain the core concepts, subjects, and intent from the original prompt. Do not discard user-provided details.
      3. FACIAL IDENTITY: CRITICAL: Preserve the facial identity of the person or persons in the source photo if applicable.
      4. VARIATION: The 3 variations must be meaningfully distinct—different times of day, different sub-styles, or different emotional tones—while still anchored to the original subject matter.
      
      Output format: JSON Array of strings.`;

      let userContent = currentPrompt.trim() 
        ? `Original Prompt: "${currentPrompt}"\n\nTask: Rewrite or enhance the original prompt based on this instruction: "${instruction}".\nProvide 3 distinct variations.`
        : `Task: Generate 3 creative image prompts based on this idea: "${instruction}".`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content;
      if (!content) {
        throw new Error("AI returned an empty response.");
      }

      let sanitizedText = content.trim();
      if (sanitizedText.startsWith('```json')) {
        sanitizedText = sanitizedText.substring(7);
      }
      if (sanitizedText.startsWith('```')) {
        sanitizedText = sanitizedText.substring(3);
      }
      if (sanitizedText.endsWith('```')) {
        sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
      }
      sanitizedText = sanitizedText.trim();
      
      res.json({ text: sanitizedText });
    } catch (e: any) {
      console.error("[OpenAI Ideas] Error:", e);
      res.status(500).json({ error: e.message || "Failed to generate ideas" });
    }
  });

  // Metadata endpoint
  app.post("/api/gemini/metadata", async (req, res) => {
    const { prompt } = req.body;
    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    
    if (!apiKey) {
      console.error("[OpenAI] API key is missing");
      return res.status(500).json({ error: "OpenAI API key is not configured." });
    }
    
    console.log("[OpenAI] Initializing Metadata with key prefix:", apiKey.substring(0, 5) + "...");
    
    try {
      const openai = new OpenAI({ 
        apiKey,
        baseURL: "https://api.openai.com/v1"
      });
      const systemInstruction = `You are an AI assistant that helps categorize and create metadata for image generation prompts. Description MUST be 5-10 words maximum. Output JSON with: name, description, category, tags.`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `Generate metadata for: "${prompt}"` }
        ],
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content;
      
      let sanitizedText = content ? content.trim() : "";
      if (sanitizedText.startsWith('```json')) {
        sanitizedText = sanitizedText.substring(7);
      }
      if (sanitizedText.startsWith('```')) {
        sanitizedText = sanitizedText.substring(3);
      }
      if (sanitizedText.endsWith('```')) {
        sanitizedText = sanitizedText.substring(0, sanitizedText.length - 3);
      }
      sanitizedText = sanitizedText.trim();
      
      res.json({ text: sanitizedText });
    } catch (e: any) {
      console.error("[OpenAI Metadata] Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  // Batch processing endpoint — processes images one at a time through Gemini, uploads to Supabase Storage, zips results
  app.post("/api/batch/start", async (req, res) => {
    const { files, prompt, model, aspectRatio, imageSize, referenceImageBase64, referenceMimeType, refStrength } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "No files provided for batch processing." });
    }
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ error: "No prompt provided." });
    }

    const apiKey = (process.env.NEWGEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || "").trim();
    if (!apiKey) {
      return res.status(500).json({ error: "No API key configured on server." });
    }

    try {
      const { data: jobRow, error: jobError } = await supabaseAdmin
        .from('batch_jobs')
        .insert([{
          status: 'processing',
          total_files: files.length,
          processed_files: 0,
          failed_files: 0,
          prompt_text: prompt,
          model,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
        }])
        .select('id')
        .single();

      if (jobError || !jobRow) {
        console.error('[Batch] Error creating job:', jobError);
        return res.status(500).json({ error: 'Failed to create batch job' });
      }

      const jobId = jobRow.id;
      console.log(`[Batch] Created job ${jobId} for ${files.length} files`);

      // Process asynchronously — respond immediately so the client can start polling
      res.json({ jobId });

      // Process each image sequentially
      (async () => {
        const genAI = new GoogleGenAI({ apiKey });
        let processed = 0;
        let failed = 0;
        const isHighFidelity = model.includes("pro") || model.includes("3.1-flash-image");

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
                finalPrompt += `\n\nSTYLE INFLUENCE SETTING: ${refStrength}/100.
                - Apply this strength to the *style transfer* (lighting, colors, texture) only.
                - Identity preservation strength is fixed at 100/100 (Maximum) for Image 1.`;
              }
            } else if (file.base64) {
              finalPrompt = `TASK: Edit the image based on the user prompt.
              
STRICT INSTRUCTION: Preserve the facial features and identity of the person in the image.

USER PROMPT: ${prompt}`;
            } else {
              finalPrompt = prompt;
            }
            parts.push({ text: finalPrompt });

            const configData: any = {
              imageConfig: { aspectRatio },
            };
            if (isHighFidelity && imageSize) {
              configData.imageConfig.imageSize = imageSize;
            }

            const response = await genAI.models.generateContent({
              model: model,
              contents: { parts },
              config: configData,
            });

            const candidate = response.candidates?.[0];
            if (!candidate) {
              console.error(`[Batch] No candidate for file ${i}: ${file.name}`);
              failed++;
              continue;
            }

            let imageData: string | null = null;
            let imageMime = 'image/png';
            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  imageData = part.inlineData.data;
                  imageMime = part.inlineData.mimeType || 'image/png';
                  break;
                }
              }
            }

            if (!imageData) {
              console.error(`[Batch] No image data for file ${i}: ${file.name}`);
              failed++;
              continue;
            }

            // Upload to Supabase Storage
            const fileExt = imageMime === 'image/jpeg' ? 'jpg' : imageMime === 'image/webp' ? 'webp' : 'png';
            const storagePath = `${jobId}/image-${String(i + 1).padStart(3, '0')}.${fileExt}`;
            const { error: uploadError } = await supabaseAdmin.storage
              .from('batch-results')
              .upload(storagePath, Buffer.from(imageData, 'base64'), {
                contentType: imageMime,
                upsert: false,
              });

            if (uploadError) {
              console.error(`[Batch] Upload error for file ${i}:`, uploadError);
              failed++;
              continue;
            }

            processed++;
            console.log(`[Batch] Job ${jobId}: processed ${processed + failed}/${files.length} (${file.name})`);

            // Update progress
            await supabaseAdmin
              .from('batch_jobs')
              .update({ processed_files: processed + failed, failed_files: failed })
              .eq('id', jobId);

          } catch (err: any) {
            console.error(`[Batch] Error processing file ${i} (${file.name}):`, err.message);
            failed++;
            await supabaseAdmin
              .from('batch_jobs')
              .update({ processed_files: processed + failed, failed_files: failed })
              .eq('id', jobId);
          }
        }

        // Build ZIP file from all successful images
        if (processed > 0) {
          try {
            console.log(`[Batch] Job ${jobId}: building ZIP with ${processed} images...`);

            const { data: fileList, error: listError } = await supabaseAdmin.storage
              .from('batch-results')
              .list(jobId);

            if (listError || !fileList) {
              console.error('[Batch] Error listing files for ZIP:', listError);
              throw listError;
            }

            // Download all files and build a simple ZIP manually
            // We use a minimal ZIP builder to avoid adding dependencies
            const zipBuffers: Buffer[] = [];
            const centralDir: Buffer[] = [];
            let offset = 0;
            const fileRecords: { name: string; offset: number; size: number; crc: number }[] = [];

            for (const fileObj of fileList) {
              const { data: fileData } = await supabaseAdmin.storage
                .from('batch-results')
                .download(`${jobId}/${fileObj.name}`);

              if (!fileData) continue;

              const fileBuffer = Buffer.from(await fileData.arrayBuffer());
              const fileName = fileObj.name;
              const crc = crc32(fileBuffer);
              const compressed = fileBuffer; // Store mode (no compression)

              // Local file header
              const localHeader = Buffer.alloc(30);
              localHeader.writeUInt32LE(0x04034b50, 0); // signature
              localHeader.writeUInt16LE(20, 4); // version needed
              localHeader.writeUInt16LE(0, 6); // flags
              localHeader.writeUInt16LE(0, 8); // compression (store)
              localHeader.writeUInt16LE(0, 10); // mod time
              localHeader.writeUInt16LE(0, 12); // mod date
              localHeader.writeUInt32LE(crc, 14); // crc32
              localHeader.writeUInt32LE(compressed.length, 18); // compressed size
              localHeader.writeUInt32LE(compressed.length, 22); // uncompressed size
              localHeader.writeUInt16LE(fileName.length, 26); // filename length
              localHeader.writeUInt16LE(0, 28); // extra field length

              zipBuffers.push(localHeader);
              zipBuffers.push(Buffer.from(fileName));
              zipBuffers.push(compressed);

              fileRecords.push({ name: fileName, offset, size: compressed.length, crc });
              offset += 30 + fileName.length + compressed.length;
            }

            // Central directory
            let cdOffset = offset;
            let cdSize = 0;
            for (const rec of fileRecords) {
              const cdRecord = Buffer.alloc(46);
              cdRecord.writeUInt32LE(0x02014b50, 0); // signature
              cdRecord.writeUInt16LE(20, 4); // version made by
              cdRecord.writeUInt16LE(20, 6); // version needed
              cdRecord.writeUInt16LE(0, 8); // flags
              cdRecord.writeUInt16LE(0, 10); // compression
              cdRecord.writeUInt16LE(0, 12); // mod time
              cdRecord.writeUInt16LE(0, 14); // mod date
              cdRecord.writeUInt32LE(rec.crc, 16); // crc32
              cdRecord.writeUInt32LE(rec.size, 20); // compressed size
              cdRecord.writeUInt32LE(rec.size, 24); // uncompressed size
              cdRecord.writeUInt16LE(rec.name.length, 28); // filename length
              cdRecord.writeUInt16LE(0, 30); // extra field length
              cdRecord.writeUInt16LE(0, 32); // comment length
              cdRecord.writeUInt16LE(0, 34); // disk number
              cdRecord.writeUInt16LE(0, 36); // internal attrs
              cdRecord.writeUInt32LE(0, 38); // external attrs
              cdRecord.writeUInt32LE(rec.offset, 42); // local header offset

              centralDir.push(cdRecord);
              centralDir.push(Buffer.from(rec.name));
              cdSize += 46 + rec.name.length;
            }

            // End of central directory
            const eocd = Buffer.alloc(22);
            eocd.writeUInt32LE(0x06054b50, 0); // signature
            eocd.writeUInt16LE(0, 4); // disk number
            eocd.writeUInt16LE(0, 6); // disk with CD
            eocd.writeUInt16LE(fileRecords.length, 8); // entries on disk
            eocd.writeUInt16LE(fileRecords.length, 10); // total entries
            eocd.writeUInt32LE(cdSize, 12); // CD size
            eocd.writeUInt32LE(cdOffset, 16); // CD offset
            eocd.writeUInt16LE(0, 20); // comment length

            const zipBuffer = Buffer.concat([...zipBuffers, ...centralDir, eocd]);
            const zipPath = `${jobId}/results.zip`;

            const { error: zipUploadError } = await supabaseAdmin.storage
              .from('batch-results')
              .upload(zipPath, zipBuffer, {
                contentType: 'application/zip',
                upsert: true,
              });

            if (zipUploadError) {
              console.error('[Batch] Error uploading ZIP:', zipUploadError);
            }

            // Clean up individual images (keep only the ZIP)
            for (const fileObj of fileList) {
              await supabaseAdmin.storage
                .from('batch-results')
                .remove([`${jobId}/${fileObj.name}`]);
            }

            await supabaseAdmin
              .from('batch_jobs')
              .update({
                status: 'completed',
                processed_files: processed + failed,
                failed_files: failed,
                result_zip_path: zipPath,
              })
              .eq('id', jobId);

            console.log(`[Batch] Job ${jobId}: completed. ${processed} succeeded, ${failed} failed.`);

          } catch (zipErr: any) {
            console.error(`[Batch] Job ${jobId}: ZIP creation failed:`, zipErr.message);
            await supabaseAdmin
              .from('batch_jobs')
              .update({
                status: 'completed',
                processed_files: processed + failed,
                failed_files: failed,
                result_zip_path: null,
              })
              .eq('id', jobId);
          }
        } else {
          await supabaseAdmin
            .from('batch_jobs')
            .update({
              status: 'failed',
              processed_files: 0,
              failed_files: failed,
            })
            .eq('id', jobId);
          console.error(`[Batch] Job ${jobId}: all ${failed} files failed.`);
        }
      })().catch(err => {
        console.error(`[Batch] Job ${jobId}: unhandled error:`, err);
      });

    } catch (error: any) {
      console.error('[Batch] Error starting batch:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to start batch processing' });
      }
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.timeout = 240000;
}

// CRC32 implementation for ZIP building
function crc32(buf: Buffer): number {
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

startServer();
