import { signal } from "@preact/signals";
import { db } from "./db";
import type { Idea, MediaInfo, MediaKind, NewIdea } from "./types";

/** Все записи, от новых к старым. */
export const ideas = signal<Idea[]>([]);
export const ready = signal(false);

const byNewest = (a: Idea, b: Idea) => b.created - a.created;

const mediaKey = (id: string, kind: MediaKind) => `${id}:${kind}`;

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function initStore(): Promise<void> {
  const all = await (await db()).getAll("ideas");
  ideas.value = all.sort(byNewest);
  ready.value = true;
}

function info(blob: Blob, duration: number): MediaInfo {
  return { mime: blob.type, size: blob.size, duration };
}

/** Сохраняет карточку (и файлы, если есть) одной транзакцией — либо всё, либо ничего. */
export async function addIdea(input: NewIdea): Promise<Idea> {
  const idea: Idea = {
    id: newId(),
    created: Date.now(),
    text: input.text.trim(),
    sourceUrl: input.sourceUrl.trim(),
    status: "new",
    synced: false,
  };
  if (input.audio) idea.audio = info(input.audio.blob, input.audio.duration);
  if (input.video) idea.video = info(input.video.blob, input.video.duration ?? 0);

  const d = await db();
  const tx = d.transaction(["ideas", "media"], "readwrite");
  const media = tx.objectStore("media");
  await Promise.all([
    tx.objectStore("ideas").put(idea),
    input.audio ? media.put(input.audio.blob, mediaKey(idea.id, "audio")) : Promise.resolve(),
    input.video ? media.put(input.video.blob, mediaKey(idea.id, "video")) : Promise.resolve(),
    tx.done,
  ]);
  ideas.value = [idea, ...ideas.value].sort(byNewest);
  return idea;
}

/** Правка текста, ссылки и статуса. Любая правка снова делает запись «не отправленной». */
export async function updateIdea(
  id: string,
  patch: Partial<Pick<Idea, "text" | "sourceUrl" | "status">>,
): Promise<void> {
  const current = ideas.value.find((i) => i.id === id);
  if (!current) return;
  const next: Idea = { ...current, ...patch, synced: false };
  next.text = next.text.trim();
  next.sourceUrl = next.sourceUrl.trim();
  await (await db()).put("ideas", next);
  ideas.value = ideas.value.map((i) => (i.id === id ? next : i));
}

/** Удаление насквозь вместе с файлами. Для «убрать, но сохранить» есть статус archived. */
export async function removeIdea(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["ideas", "media"], "readwrite");
  const media = tx.objectStore("media");
  await Promise.all([
    tx.objectStore("ideas").delete(id),
    media.delete(mediaKey(id, "audio")),
    media.delete(mediaKey(id, "video")),
    tx.done,
  ]);
  ideas.value = ideas.value.filter((i) => i.id !== id);
}

export async function getMedia(id: string, kind: MediaKind): Promise<Blob | undefined> {
  return (await db()).get("media", mediaKey(id, kind));
}
