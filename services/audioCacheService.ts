// Audio Cache Protocol using IndexedDB for durable local persistence of recordings
// Solves browser session loss, quota limits of localStorage, and URL.createObjectURL revocation

export interface CachedAudioRecord {
  id: string; // Session ID
  blob: Blob;
  mimeType: string;
  duration: number; // in seconds
  size: number; // in bytes
  createdAt: number;
  transcript?: string;
  speakerCount?: number;
  tags?: string[];
}

const DB_NAME = 'neurophenom_audio_vault';
const DB_VERSION = 1;
const STORE_NAME = 'audio_recordings';

// Cache of active object URLs for cleanup
const activeObjectUrls = new Map<string, string>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudioToCache(
  sessionId: string,
  blob: Blob,
  duration: number = 0,
  extra: { transcript?: string; tags?: string[] } = {}
): Promise<CachedAudioRecord> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record: CachedAudioRecord = {
      id: sessionId,
      blob,
      mimeType: blob.type || 'audio/webm',
      duration: Math.round(duration),
      size: blob.size,
      createdAt: Date.now(),
      transcript: extra.transcript,
      tags: extra.tags,
    };

    const request = store.put(record);

    request.onsuccess = () => {
      // Invalidate any previously cached URL so fresh URL is generated
      if (activeObjectUrls.has(sessionId)) {
        try {
          URL.revokeObjectURL(activeObjectUrls.get(sessionId)!);
        } catch (e) {}
        activeObjectUrls.delete(sessionId);
      }
      resolve(record);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getAudioFromCache(sessionId: string): Promise<CachedAudioRecord | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(sessionId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => reject(request.error);
  });
}

export async function hasAudioCached(sessionId: string): Promise<boolean> {
  try {
    const record = await getAudioFromCache(sessionId);
    return record !== null && record.size > 0;
  } catch {
    return false;
  }
}

export async function getAudioBlobUrl(sessionId: string): Promise<string | null> {
  if (activeObjectUrls.has(sessionId)) {
    return activeObjectUrls.get(sessionId)!;
  }

  const record = await getAudioFromCache(sessionId);
  if (!record || !record.blob) return null;

  const url = URL.createObjectURL(record.blob);
  activeObjectUrls.set(sessionId, url);
  return url;
}

export async function deleteAudioFromCache(sessionId: string): Promise<void> {
  if (activeObjectUrls.has(sessionId)) {
    try {
      URL.revokeObjectURL(activeObjectUrls.get(sessionId)!);
    } catch (e) {}
    activeObjectUrls.delete(sessionId);
  }

  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(sessionId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function listAllCachedAudio(): Promise<CachedAudioRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function updateCachedTranscript(sessionId: string, transcript: string): Promise<void> {
  const record = await getAudioFromCache(sessionId);
  if (!record) return;

  record.transcript = transcript;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function getStorageUsage(): Promise<{ count: number; totalBytes: number; formattedSize: string }> {
  try {
    const all = await listAllCachedAudio();
    const totalBytes = all.reduce((acc, curr) => acc + (curr.size || 0), 0);
    return {
      count: all.length,
      totalBytes,
      formattedSize: formatBytes(totalBytes),
    };
  } catch {
    return { count: 0, totalBytes: 0, formattedSize: '0 B' };
  }
}

export async function exportCachedAudio(sessionId: string, customName?: string): Promise<boolean> {
  const record = await getAudioFromCache(sessionId);
  if (!record || !record.blob) return false;

  const extension = record.mimeType.includes('wav') ? 'wav' : record.mimeType.includes('mp3') ? 'mp3' : 'webm';
  const filename = customName || `neurophenom_${sessionId.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.${extension}`;

  const url = URL.createObjectURL(record.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
