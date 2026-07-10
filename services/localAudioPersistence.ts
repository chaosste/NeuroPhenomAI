/**
 * In-app interview audio cache (IndexedDB) plus optional explicit download.
 * Finalize & Map must NOT force a browser Save dialog — analysis uses the
 * in-memory blob URL, and this store keeps a durable copy the app can reopen.
 */

const DB_NAME = 'neurophenom-audio';
const DB_VERSION = 1;
const STORE = 'recordings';

export type CachedRecording = {
  sessionId: string;
  blob: Blob;
  mimeType: string;
  savedAt: string;
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'sessionId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });

/** Persist recording for in-app reuse (no download dialog). */
export async function cacheInterviewRecording(
  sessionId: string,
  blob: Blob
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.objectStore(STORE).put({
      sessionId,
      blob,
      mimeType: blob.type || 'audio/webm',
      savedAt: new Date().toISOString()
    } satisfies CachedRecording);
  });
  db.close();
}

export async function getCachedInterviewRecording(
  sessionId: string
): Promise<Blob | null> {
  try {
    const db = await openDb();
    const row = await new Promise<CachedRecording | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(sessionId);
      req.onsuccess = () => resolve(req.result as CachedRecording | undefined);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    db.close();
    return row?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteCachedInterviewRecording(sessionId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
      tx.objectStore(STORE).delete(sessionId);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** Explicit user-initiated export only (Save / Downloads). */
export async function downloadInterviewRecording(
  blob: Blob,
  sessionId: string
): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const short = sessionId.replace(/-/g, '').slice(0, 8);
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const suggestedName = `neurophenom-${short}-${stamp}.${ext}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated Use cacheInterviewRecording for finalize; downloadInterviewRecording for export. */
export async function persistInterviewRecording(
  blob: Blob,
  sessionId: string
): Promise<void> {
  await cacheInterviewRecording(sessionId, blob);
}
