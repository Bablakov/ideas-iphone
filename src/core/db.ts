import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Idea } from "./types";

interface Schema extends DBSchema {
  ideas: { key: string; value: Idea };
  media: { key: string; value: Blob };
}

export type IdeasDb = IDBPDatabase<Schema>;

let opened: Promise<IdeasDb> | undefined;

/** Открывает базу один раз на всё приложение. */
export function db(): Promise<IdeasDb> {
  opened ??= openDB<Schema>("ideas", 1, {
    upgrade(d) {
      d.createObjectStore("ideas", { keyPath: "id" });
      d.createObjectStore("media");
    },
  });
  return opened;
}
