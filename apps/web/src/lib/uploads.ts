// Per-browser file storage for reviews, chat and community uploads.
// Static demo: files never leave the device. They live in IndexedDB (idb),
// with size limits, generated thumbnails and object URLs for playback.
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import { useEffect, useState } from 'react';

export interface StoredFile {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  blob: Blob;
  thumb?: Blob; // JPEG thumbnail for images and videos
  width?: number;
  height?: number;
  duration?: number;
  createdAt: string;
}
export type Attachment = Pick<StoredFile, 'id' | 'name' | 'type' | 'size' | 'kind'>;

interface UploadDb extends DBSchema {
  files: { key: string; value: StoredFile };
}

export const LIMITS = {
  image: 10 * 1024 * 1024,
  video: 80 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  file: 20 * 1024 * 1024,
  perPost: 10,
  totalBytes: 400 * 1024 * 1024,
};
export const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|js|vbs|ps1|jar|apk|sh|dll)$/i;

let dbp: Promise<IDBPDatabase<UploadDb>> | null = null;
function db() {
  dbp ??= openDB<UploadDb>('safqa-uploads', 1, {
    upgrade(d) {
      d.createObjectStore('files', { keyPath: 'id' });
    },
  });
  return dbp;
}

export function kindOf(type: string): StoredFile['kind'] {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function canvasThumb(source: CanvasImageSource, w: number, h: number): Promise<Blob | undefined> {
  const scale = Math.min(1, 480 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob((b) => r(b ?? undefined), 'image/jpeg', 0.8));
}

async function imageMeta(blob: Blob) {
  const bmp = await createImageBitmap(blob);
  const thumb = await canvasThumb(bmp, bmp.width, bmp.height);
  return { width: bmp.width, height: bmp.height, thumb };
}

function videoMeta(blob: Blob): Promise<{ width?: number; height?: number; duration?: number; thumb?: Blob }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.src = url;
    const done = (out: { width?: number; height?: number; duration?: number; thumb?: Blob }) => {
      URL.revokeObjectURL(url);
      resolve(out);
    };
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 2) / 2);
    };
    v.onseeked = async () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration, thumb: await canvasThumb(v, v.videoWidth, v.videoHeight) });
    v.onerror = () => done({});
    setTimeout(() => done({}), 6000);
  });
}

export async function usage(): Promise<number> {
  const all = await (await db()).getAll('files');
  return all.reduce((n, f) => n + f.size, 0);
}

export class UploadError extends Error {}

export async function saveUpload(file: File): Promise<Attachment> {
  const kind = kindOf(file.type);
  if (BLOCKED_EXT.test(file.name)) throw new UploadError('نوع الملف ده ممنوع لأسباب أمان');
  if (file.size > LIMITS[kind]) throw new UploadError(`الحد الأقصى ${humanSize(LIMITS[kind])} لـ ${kind === 'image' ? 'الصور' : kind === 'video' ? 'الفيديو' : 'الملفات'}`);
  if ((await usage()) + file.size > LIMITS.totalBytes) throw new UploadError('المساحة المحلية امتلأت — امسح ملفات قديمة من الإعدادات');
  const extra = kind === 'image' ? await imageMeta(file).catch(() => ({})) : kind === 'video' ? await videoMeta(file) : {};
  const stored: StoredFile = { id: crypto.randomUUID(), name: file.name, type: file.type || 'application/octet-stream', size: file.size, kind, blob: file, createdAt: new Date().toISOString(), ...extra };
  await (await db()).put('files', stored);
  return { id: stored.id, name: stored.name, type: stored.type, size: stored.size, kind };
}

export async function getUpload(id: string) {
  return (await db()).get('files', id);
}
export async function deleteUpload(id: string) {
  await (await db()).delete('files', id);
}
export async function listUploads() {
  return (await db()).getAll('files');
}

/** Object URL for a stored file (or its thumbnail); revoked on unmount. */
export function useUploadUrl(id: string | undefined, which: 'blob' | 'thumb' = 'blob') {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!id) return;
    let made: string | null = null;
    let cancel = false;
    void getUpload(id).then((f) => {
      if (cancel) return;
      if (!f) return setMissing(true);
      const b = which === 'thumb' ? (f.thumb ?? f.blob) : f.blob;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      cancel = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id, which]);
  return { url, missing };
}
