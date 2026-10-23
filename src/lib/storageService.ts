import { getApiUrl } from './utils';
import { db, auth } from './firebase';
import { doc, setDoc, getDoc, collection, getDocs, orderBy, query } from 'firebase/firestore';

export interface UploadResult {
  url: string;
  name: string;
  size: number;
  mimeType: string;
  fileId?: string;
  data?: string;
}

/**
 * Reads a file as a Base64 data URL.
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Không thể đọc tệp "${file.name}" từ thiết bị.`));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

/**
 * Retrieves a file from the persistent Firestore file_storage collection.
 * Reassembles chunks if the file was split into multiple documents.
 */
export async function getFileFromStorage(fileId: string): Promise<{ dataUrl: string; name: string; mimeType: string; size: number } | null> {
  try {
    if (!fileId) return null;
    const cleanId = fileId.replace(/^firestore:\/\//, '').trim();
    const fileRef = doc(db, 'file_storage', cleanId);
    const snap = await getDoc(fileRef);

    if (!snap.exists()) {
      return null;
    }

    const data = snap.data();
    if (!data.isChunked && data.data) {
      return {
        dataUrl: data.data,
        name: data.name || 'document',
        mimeType: data.mimeType || 'application/octet-stream',
        size: data.size || 0
      };
    }

    if (data.isChunked) {
      const chunksSnap = await getDocs(query(collection(db, 'file_storage', cleanId, 'chunks'), orderBy('chunkIndex', 'asc')));
      let fullBase64 = '';
      chunksSnap.forEach(chunkDoc => {
        fullBase64 += chunkDoc.data().data || '';
      });

      return {
        dataUrl: fullBase64,
        name: data.name || 'document',
        mimeType: data.mimeType || 'application/octet-stream',
        size: data.size || 0
      };
    }

    return null;
  } catch (err) {
    console.warn(`[storageService] Could not retrieve file ${fileId} from Firestore:`, err);
    return null;
  }
}

/**
 * Uploads a file to:
 * 1. Persistent Firestore `file_storage` collection (guarantees survival across server reboots/redeployments)
 * 2. Backend `/api/upload` endpoint (for fast server streaming and proxy downloads)
 */
export async function uploadFile(
  file: File,
  folder = 'general'
): Promise<UploadResult> {
  const base64Data = await readFileAsDataURL(file);
  const fileId = `f_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const mimeType = file.type || 'application/octet-stream';

  // 1. Persist to Firestore file_storage (Chunks for files > 700KB)
  let firestorePersisted = false;
  try {
    const CHUNK_SIZE = 400 * 1024; // 400KB characters per chunk to stay well under 1MB Firestore limit
    if (base64Data.length <= 700 * 1024) {
      await setDoc(doc(db, 'file_storage', fileId), {
        fileId,
        name: file.name,
        size: file.size,
        mimeType,
        folder,
        data: base64Data,
        isChunked: false,
        uploadedBy: auth.currentUser?.uid || 'anonymous',
        createdAt: new Date().toISOString()
      });
      firestorePersisted = true;
    } else {
      const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);
      await setDoc(doc(db, 'file_storage', fileId), {
        fileId,
        name: file.name,
        size: file.size,
        mimeType,
        folder,
        isChunked: true,
        totalChunks,
        uploadedBy: auth.currentUser?.uid || 'anonymous',
        createdAt: new Date().toISOString()
      });

      for (let i = 0; i < totalChunks; i++) {
        const chunkText = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        await setDoc(doc(db, 'file_storage', fileId, 'chunks', String(i)), {
          chunkIndex: i,
          data: chunkText
        });
      }
      firestorePersisted = true;
    }
  } catch (fsErr) {
    console.warn('[storageService] Warning: Could not persist to Firestore file_storage:', fsErr);
  }

  // 2. Upload to server backend (/api/upload)
  let serverUrl = '';
  try {
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
        fileId,
        mimeType,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      serverUrl = data.url;
    }
  } catch (serverErr) {
    console.warn('[storageService] Warning: Upload to /api/upload failed, relying on persistent Firestore:', serverErr);
  }

  // Fallback to data URL or firestore protocol if server did not respond
  const finalUrl = serverUrl 
    ? (serverUrl.includes('?') ? `${serverUrl}&fid=${fileId}` : `${serverUrl}?fid=${fileId}`)
    : (firestorePersisted ? `firestore://${fileId}` : (file.size < 800 * 1024 ? base64Data : `firestore://${fileId}`));

  return {
    url: finalUrl,
    fileId,
    name: file.name,
    size: file.size,
    mimeType,
    data: file.size <= 300 * 1024 ? base64Data : undefined
  };
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
