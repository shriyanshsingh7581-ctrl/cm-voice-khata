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
