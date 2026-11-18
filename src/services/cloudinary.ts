const CLOUDINARY_CLOUD_NAME =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'dxeuzdwkz';
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'Mobile app';

/**
 * Uploads an image File, Blob, or dataURL to Cloudinary (`dxeuzdwkz` / `Mobile app`).
 */
export async function uploadToCloudinary(fileOrDataUrl: File | Blob | string): Promise<string> {
  const formData = new FormData();
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('file', fileOrDataUrl);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Cloudinary upload failed: ${errText}`);
  }

  const data = (await response.json()) as { secure_url?: string; url?: string };
  const uploadedUrl = data.secure_url || data.url;
  if (!uploadedUrl) {
    throw new Error('Cloudinary did not return a valid URL');
  }
  return uploadedUrl;
}

/**
 * Helper to convert a File or Blob to base64 string (without data:... prefix) for AI Vision / Audio endpoints.
 */
export function fileToBase64(file: File | Blob): Promise<{ base64: string; dataUrl: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = String(reader.result || '');
      const parts = dataUrl.split(',');
      const base64 = parts.length > 1 ? parts[1] : '';
      resolve({
        base64,
        dataUrl,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses & resizes large mobile camera/gallery photos to <= 1600px JPEG (~180KB-450KB)
 * so AI Vision scanning & Cloudinary uploads are fast and never hit payload/timeout limits on mobile networks.
 */
export async function compressImageForAI(
  file: File | Blob,
  maxDimension = 1600,
  quality = 0.85
): Promise<{ base64: string; dataUrl: string; mimeType: string; blob: Blob }> {
  const original = await fileToBase64(file);

  if (!file.type.startsWith('image/')) {
    return { ...original, blob: file };
  }

  try {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image decode failed'));
      el.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    let { width, height } = img;
    if (width <= 0 || height <= 0) {
      return { ...original, blob: file };
    }

    if (width > maxDimension || height > maxDimension) {
      if (width >= height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ...original, blob: file };
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64 = dataUrl.split(',')[1] || original.base64;
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
    });

    return {
      base64,
      dataUrl,
      mimeType: 'image/jpeg',
      blob,
    };
  } catch {
    return { ...original, blob: file };
  }
}
