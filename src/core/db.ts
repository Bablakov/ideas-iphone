import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Idea } from "./types";

/** Черновик карточки: поля лежат под ключом `meta`, файлы — под `audio` и `video`. */
export interface DraftMeta {
  text: string;
  sourceUrl: string;
  linkOn: boolean;
  audioDuration: number;
}

interface Schema extends DBSchema {
  ideas: { key: string; value: Idea };
  media: { key: string; value: Blob };
  draft: { key: string; value: DraftMeta | Blob };
}

export type IdeasDb = IDBPDatabase<Schema>;

let opened: Promise<IdeasDb> | undefined;

/** Старая запись версии 1: один файл под ключом id и поле kind. */
interface LegacyIdea {
  id: string;
  created: number;
  kind: "audio" | "video" | "text";
  text: string;
  sourceUrl: string;
  status: "new" | "processed";
  mediaMime: string;
  mediaSize: number;
  duration: number;
  synced: boolean;
}

/** Открывает базу один раз на всё приложение. */
export function db(): Promise<IdeasDb> {
  opened ??= openDB<Schema>("ideas", 3, {
    async upgrade(d, oldVersion, _newVersion, tx) {
      if (oldVersion < 1) {
        d.createObjectStore("ideas", { keyPath: "id" });
        d.createObjectStore("media");
      }
      if (oldVersion < 2) {
        d.createObjectStore("draft");
        // v1 → v2: одиночный файл переезжает под ключ `<id>:audio|video`, kind заменяется полями audio/video.
        const ideas = tx.objectStore("ideas");
        const media = tx.objectStore("media");
        for (const raw of (await ideas.getAll()) as unknown as LegacyIdea[]) {
          const next: Idea = {
            id: raw.id,
            created: raw.created,
            updated: raw.created,
            text: raw.text,
            sourceUrl: raw.sourceUrl,
            status: raw.status,
            synced: false,
          };
          if (raw.kind === "audio" || raw.kind === "video") {
            const info = { mime: raw.mediaMime, size: raw.mediaSize, duration: raw.duration };
            const blob = await media.get(raw.id);
            if (blob) {
              await media.put(blob, `${raw.id}:${raw.kind}`);
              next[raw.kind] = info;
            }
            await media.delete(raw.id);
          }
          await ideas.put(next);
        }
      }
      if (oldVersion < 3) {
        // v3: у каждой карточки появилось время правки — по нему синхронизация выбирает свежую версию.
        const ideas = tx.objectStore("ideas");
        for (const idea of await ideas.getAll()) {
          if (typeof idea.updated !== "number") await ideas.put({ ...idea, updated: idea.created });
        }
      }
    },
  });
  return opened;
}
