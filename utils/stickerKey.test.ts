import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildGeminiGenerateParams } from '../services/geminiService.ts';
import {
  STICKER_KEY_SCREEN_INSTRUCTION,
  appendStickerKeyInstruction,
  keyChromaGreen,
  stickerAlpha,
  stickerDownloadName,
} from './stickerKey.ts';

const pixel = (rgba: Uint8ClampedArray, x: number, y: number, width: number) => {
  const i = (y * width + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
};

const fill = (width: number, height: number, color: [number, number, number, number]) => {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = color[3];
  }
  return rgba;
};

const AEROBICS =
  '1980s aerobics instructor, neon leotard, leg warmers, big hair, sweatband, keep the face exactly. Shot like a VHS workout poster.';

test('photo prompts are not rewritten', () => {
  const fields = {
    imageBase64: 'src-photo',
    mimeType: 'image/jpeg',
    referenceImages: [{ base64: 'ref-a', mimeType: 'image/jpeg' }],
    refStrength: 30,
    prompt: AEROBICS,
    aspectRatio: '1:1',
    imageSize: '1K',
    model: 'gemini-3.1-flash-image',
    stickerMode: false,
  };
  const params = buildGeminiGenerateParams(fields);
  assert.equal(params.prompt, AEROBICS);
  assert.equal(params.prompt.includes('STICKER KEY SCREEN'), false);
  assert.equal('stickerMode' in params, false);
});

test('themed prompt, references, and settings reach the gemini-generate payload intact', () => {
  const references = [
    { base64: 'leotard-ref', mimeType: 'image/jpeg' },
    { base64: 'vhs-grade-ref', mimeType: 'image/png' },
  ];
  const fields = {
    imageBase64: 'guest-photo',
    mimeType: 'image/jpeg',
    referenceImages: references,
    refStrength: 65,
    prompt: AEROBICS,
    aspectRatio: '2:3',
    imageSize: '2K',
    model: 'gemini-3-pro-image',
    stickerMode: true,
  };

  const params = buildGeminiGenerateParams(fields);
  const payload = { params };

  assert.equal('stickerMode' in payload.params, false);
  assert.equal(payload.params.prompt.slice(0, AEROBICS.length), AEROBICS);
  assert.equal(
    payload.params.prompt,
    appendStickerKeyInstruction(AEROBICS)
  );
  assert.ok(payload.params.prompt.indexOf(AEROBICS) < payload.params.prompt.indexOf('STICKER KEY SCREEN'));
  assert.ok(payload.params.prompt.endsWith(STICKER_KEY_SCREEN_INSTRUCTION));
  assert.match(payload.params.prompt, /#00FF00/);
  assert.match(payload.params.prompt, /RGB\(0,255,0\)/);
  assert.match(payload.params.prompt, /Do not use a transparent background/);
  assert.match(payload.params.prompt, /Do not draw a checkerboard/);

  assert.deepEqual(payload.params.referenceImages, references);
  assert.equal(payload.params.refStrength, 65);
  assert.equal(payload.params.aspectRatio, '2:3');
  assert.equal(payload.params.imageSize, '2K');
  assert.equal(payload.params.model, 'gemini-3-pro-image');
  assert.equal(payload.params.imageBase64, 'guest-photo');
  assert.equal(payload.params.mimeType, 'image/jpeg');

  const plain = buildGeminiGenerateParams({ ...fields, stickerMode: false });
  assert.deepEqual({ ...payload.params, prompt: AEROBICS }, plain);
});

test('key instruction does not replace a prompt that mentions a transparent background', () => {
  const theme = 'Die-cut sticker of the guest on a transparent background, 1980s aerobics.';
  const wrapped = appendStickerKeyInstruction(theme);
  assert.equal(wrapped.slice(0, theme.length), theme);
  assert.ok(wrapped.indexOf('transparent background') < wrapped.indexOf('STICKER KEY SCREEN'));
});

test('pure and near green key out; skin, white, and dark green stay', () => {
  assert.equal(stickerAlpha(0, 255, 0), 0);
  assert.equal(stickerAlpha(8, 248, 6), 0);
  assert.ok(stickerAlpha(40, 220, 40) < 80);
  assert.equal(stickerAlpha(220, 160, 140), 255);
  assert.equal(stickerAlpha(255, 255, 255), 255);
  assert.equal(stickerAlpha(0, 0, 0), 255);
  assert.equal(stickerAlpha(30, 120, 40), 255);
});

test('a green plate around a subject becomes transparent pixels', () => {
  const width = 12;
  const height = 12;
  const rgba = fill(width, height, [0, 255, 0, 255]);
  for (let y = 3; y <= 8; y++) {
    for (let x = 3; x <= 8; x++) {
      const i = (y * width + x) * 4;
      rgba[i] = 210;
      rgba[i + 1] = 150;
      rgba[i + 2] = 130;
      rgba[i + 3] = 255;
    }
  }
  rgba[0] = 10;
  rgba[1] = 246;
  rgba[2] = 8;

  const keyed = keyChromaGreen(rgba, width, height);
  const corner = pixel(keyed, 0, 0, width);
  assert.equal(corner[3], 0);
  assert.deepEqual(corner.slice(0, 3), [255, 255, 255]);
  assert.equal(pixel(keyed, 11, 11, width)[3], 0);

  const center = pixel(keyed, 5, 5, width);
  assert.equal(center[3], 255);
  assert.equal(center[0], 210);
  assert.equal(center[1], 150);
  assert.equal(center[2], 130);
});

test('a 2px green fringe is choked and the white outline is despilled', () => {
  const width = 8;
  const height = 3;
  const rgba = fill(width, height, [0, 255, 0, 255]);
  const paint = (x: number, color: [number, number, number]) => {
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  };
  paint(0, [0, 255, 0]);
  paint(1, [12, 246, 8]);
  paint(2, [30, 230, 28]);
  paint(3, [48, 214, 40]);
  paint(4, [230, 255, 226]);
  paint(5, [255, 255, 255]);
  paint(6, [214, 164, 138]);
  paint(7, [214, 164, 138]);

  const keyed = keyChromaGreen(rgba, width, height);

  for (const x of [0, 1, 2, 3]) {
    const sample = pixel(keyed, x, 1, width);
    assert.equal(sample[3], 0, `fringe x=${x} alpha ${sample[3]}`);
    assert.ok(sample[1] <= Math.max(sample[0], sample[2]), `removed pixel kept green ${sample}`);
  }

  const outerOutline = pixel(keyed, 4, 1, width);
  assert.ok(outerOutline[3] > 120, `white outline was eaten, alpha ${outerOutline[3]}`);
  const excess = outerOutline[1] - Math.max(outerOutline[0], outerOutline[2]);
  assert.ok(excess <= 2, `outline still green ${outerOutline}`);

  const innerOutline = pixel(keyed, 5, 1, width);
  assert.equal(innerOutline[3], 255);
  assert.deepEqual(innerOutline.slice(0, 3), [255, 255, 255]);

  const skin = pixel(keyed, 6, 1, width);
  assert.equal(skin[3], 255);
  assert.equal(skin[0], 214);
  assert.equal(skin[1], 164);
  assert.equal(skin[2], 138);
});

test('softened edges do not revive a green halo', () => {
  const width = 4;
  const rgba = new Uint8ClampedArray([
    0, 255, 0, 255,
    0, 255, 0, 255,
    210, 150, 130, 255,
    210, 150, 130, 255,
  ]);
  const keyed = keyChromaGreen(rgba, width, 1, { soften: false });
  assert.equal(keyed[3], 0);
  assert.deepEqual([keyed[0], keyed[1], keyed[2]], [255, 255, 255]);
  assert.ok(keyed[2 * 4 + 3] > 0);
});

test('green fringe is despilled', () => {
  const rgba = new Uint8ClampedArray([40, 220, 40, 255]);
  const keyed = keyChromaGreen(rgba, 1, 1, { soften: false, chokePasses: 0 });
  assert.ok(keyed[3] < 80);
  assert.ok(keyed[1] <= 40, `green channel ${keyed[1]} was not pulled down`);
});

test('sticker downloads are named fun-frame-<time>.png', () => {
  assert.equal(stickerDownloadName(1710000000000), 'fun-frame-1710000000000.png');
});

test('the app sends the author prompt and keys before overlay', () => {
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const gemini = readFileSync(new URL('../services/geminiService.ts', import.meta.url), 'utf8');
  const imageUtils = readFileSync(new URL('./imageUtils.ts', import.meta.url), 'utf8');

  assert.match(gemini, /buildGeminiGenerateParams/);
  assert.match(gemini, /JSON\.stringify\(\{ params: requestParams \}\)/);
  const fetchBody = gemini.slice(gemini.indexOf('JSON.stringify'));
  assert.equal(fetchBody.includes('stickerMode'), false);

  assert.match(app, /prompt: effectivePrompt/);
  assert.match(app, /referenceImages: refImagesForApi\.length > 0 \? refImagesForApi : undefined/);
  assert.match(app, /refStrength: refImagesForApi\.length > 0 \? refStrength : undefined/);
  assert.match(app, /stickerMode: isStickerMode/);

  const keyAt = app.indexOf('keyOutStickerBackground(resultImage)');
  const overlayAt = app.indexOf('compositeOverlay(resultImage, overlayImage)');
  assert.ok(keyAt > 0 && overlayAt > keyAt, 'keying runs before overlay compositing');
  assert.match(app, /if \(isStickerMode\) \{[\s\S]*?keyOutStickerBackground\(resultImage\)[\s\S]*?\} else if \(overlayImage\)/);
  assert.match(app, /uploadImageToStorage\(generatedImage, 'png'\)/);
  assert.match(app, /stickerDownloadName\(/);
  assert.match(app, /base64ToBlob\(generatedImage, 'image\/png'\)/);

  const keyStart = imageUtils.indexOf('export const keyOutStickerBackground');
  const keyFn = imageUtils.slice(keyStart, imageUtils.indexOf('export const compressImageBase64'));
  assert.match(keyFn, /toDataURL\('image\/png'\)/);
  assert.equal(keyFn.includes('image/jpeg'), false);
  assert.equal(keyFn.includes('image/webp'), false);
});
