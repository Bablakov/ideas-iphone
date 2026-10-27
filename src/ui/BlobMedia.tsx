import { useEffect, useState } from "preact/hooks";
import type { MediaKind } from "../core/types";

/** Плеер для Blob. Ссылка на объект живёт, пока плеер на экране, и освобождается при уходе. */
export function BlobMedia({ blob, kind }: { blob: Blob; kind: MediaKind }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  return kind === "audio" ? (
    <audio class="media-audio" controls src={url} preload="metadata" />
  ) : (
    <video class="media-video" controls playsInline src={url} preload="metadata" />
  );
}
