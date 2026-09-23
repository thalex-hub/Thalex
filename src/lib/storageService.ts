import { getApiUrl } from './utils';

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Uploads a file to the application backend (/api/upload).
 * This completely avoids dependency on Firebase Storage / Google Cloud Storage billing accounts.
 */
export async function uploadFile(
  file: File,
  folder = 'general'
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error(`Không thể đọc tệp "${file.name}" từ thiết bị của bạn.`));
    };

    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;

        const uploadUrl = getApiUrl('/api/upload');
        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filename: file.name,
            base64Data,
            folder,
            mimeType: file.type || 'application/octet-stream',
          }),
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          throw new Error(errJson?.error || `Máy chủ phản hồi mã lỗi: ${response.status}`);
        }

        const data = await response.json();
        resolve({
          url: data.url,
          name: data.originalName || file.name,
          size: data.size || file.size,
          mimeType: file.type || 'application/octet-stream',
        });
      } catch (err: any) {
        console.error('File upload failed via /api/upload:', err);
        // Fallback for smaller files (< 800KB) like receipt photos or signatures
        if (file.size < 800 * 1024 && reader.result) {
          console.warn('Falling back to direct data URI for file:', file.name);
          resolve({
            url: reader.result as string,
            name: file.name,
            size: file.size,
            mimeType: file.type || 'application/octet-stream',
          });
          return;
        }
        reject(new Error(`Tải tệp "${file.name}" thất bại: ${err.message}`));
      }
    };

    reader.readAsDataURL(file);
  });
}

export async function uploadFiles(
  files: File[],
  folder = 'general'
): Promise<UploadResult[]> {
  const results: UploadResult[] = [];
  for (const f of files) {
    const res = await uploadFile(f, folder);
    results.push(res);
  }
  return results;
}
