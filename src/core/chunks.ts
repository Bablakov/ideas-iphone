import type { MediaKind } from "./types";

/** Размер одной части файла в репозитории. */
export const PART_SIZE = 10 * 1024 * 1024;

/** Режет файл по байтам. Пустой файл остаётся одной пустой частью, чтобы у медиа всегда была часть 000. */
export function splitBlob(blob: Blob, size: number = PART_SIZE): Blob[] {
  if (blob.size === 0) return [blob];
  const parts: Blob[] = [];
  for (let start = 0; start < blob.size; start += size) parts.push(blob.slice(start, start + size));
  return parts;
}

/** Склейка — простая конкатенация байт, перекодирования нет. */
export function joinParts(parts: readonly Blob[], mime: string): Blob {
  return new Blob([...parts], { type: mime });
}

/** Имя файла части внутри папки карточки: `audio.000`, `video.012`. */
export function partName(kind: MediaKind, index: number): string {
  return `${kind}.${String(index).padStart(3, "0")}`;
}

export async function sha256Hex(data: Blob | ArrayBuffer): Promise<string> {
  const buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Blob → base64 (для API GitHub). Кусками, чтобы не упереться в лимит аргументов. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
