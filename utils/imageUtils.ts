import imageCompression from 'browser-image-compression';

/**
 * Converts a File object to a Base64 string.
 */
export const fileToBase64 = (file: File | Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Strips the Data URL prefix (e.g., "data:image/png;base64,") to get raw base64.
 */
export const stripBase64Prefix = (dataUrl: string): string => {
  return dataUrl.split(',')[1] || dataUrl;
};

/**
 * Gets the mime type from a base64 string or filename.
 */
export const getMimeType = (file: File): string => {
  return file.type || 'image/png';
};

/**
 * Extracts the mime type from a data URL string.
 */
export const getMimeTypeFromBase64 = (dataUrl: string): string => {
  if (dataUrl.startsWith('data:')) {
    return dataUrl.substring(5, dataUrl.indexOf(';'));
  }
  return 'image/png';
};

/**
 * Validates an image file for supported types and size limits.
 */
export const validateImageFile = (file: File): string | null => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  const maxSize = 10 * 1024 * 1024; // 10MB limit

  if (!validTypes.includes(file.type)) {
    return 'Unsupported file format. Please use JPG, PNG, WEBP, or HEIC.';
  }

  if (file.size > maxSize) {
    return 'File size exceeds 10MB limit.';
  }

  return null;
};

/**
 * Converts a Base64 string to a Blob.
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
  // Strip prefix if present
  const content = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(content);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * Compresses a Base64 image string to WebP format, reducing size for storage.
 */
/**
 * Composites an overlay image on top of a base image using canvas.
 * The overlay is scaled to cover the base image dimensions.
 * Returns a data URL (PNG) of the composited result.
 */
export const compositeOverlay = async (
  baseImageDataUrl: string,
  overlayDataUrl: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const baseImg = new Image();
    const overlayImg = new Image();
    let loaded = 0;

    const tryComposite = () => {
      loaded++;
      if (loaded < 2) return;

      const canvas = document.createElement('canvas');
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      ctx.drawImage(baseImg, 0, 0);
      ctx.drawImage(overlayImg, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/png'));
    };

    baseImg.onload = tryComposite;
    overlayImg.onload = tryComposite;
    baseImg.onerror = () => reject(new Error('Failed to load base image'));
    overlayImg.onerror = () => reject(new Error('Failed to load overlay image'));
    baseImg.src = baseImageDataUrl;
    overlayImg.src = overlayDataUrl;
  });
};

export const compressImageBase64 = async (base64String: string | null): Promise<string | null> => {
  if (!base64String) return base64String;
  try {
    const mimeType = getMimeTypeFromBase64(base64String);
    const blob = base64ToBlob(base64String, mimeType);
    const file = new File([blob], "image.jpg", { type: mimeType });
    
    // We want a modest compression for library preview and reference images.
    // Quality vs size trade-off.
    const options = {
      maxSizeMB: 0.15, // Aim for <=150KB
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: 'image/webp'
    };
    
    const compressedFile = await imageCompression(file, options);
    return await fileToBase64(compressedFile);
  } catch (error) {
    console.error("Compression failed", error);
    return base64String; // fallback to original if compression fails
  }
};
