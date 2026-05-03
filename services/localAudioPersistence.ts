/**
 * Writes the captured clip into the browser download folder (typically
 * ~/Downloads). Move into ~/Documents/app-recordings if you keep local
 * archives there. Browsers cannot silently write under Documents; MP3 is not
 * emitted by MediaRecorder—clips are WebM/Opus or similar, which Gemini accepts.
 */
export async function persistInterviewRecording(blob: Blob, sessionId: string): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const short = sessionId.replace(/-/g, '').slice(0, 8);
  const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('ogg') ? 'ogg' : 'webm';
  const suggestedName = `app-recordings-neurophenom-${short}-${stamp}.${ext}`;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}
