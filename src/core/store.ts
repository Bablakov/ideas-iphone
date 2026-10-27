import { signal } from "@preact/signals";
import { db } from "./db";
import type { Idea, NewIdea } from "./types";

/** Все записи, от новых к старым. */
export const ideas = signal<Idea[]>([]);
export const ready = signal(false);

const byNewest = (a: Idea, b: Idea) => b.created - a.created;

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function initStore(): Promise<void> {
  const all = await (await db()).getAll("ideas");
  ideas.value = all.sort(byNewest);
  ready.value = true;
}

/** Сохраняет идею (и файл, если есть) одной транзакцией — либо всё, либо ничего. */
export async function addIdea(input: NewIdea, media?: Blob): Promise<Idea> {
  const idea: Idea = {
    id: newId(),
    created: Date.now(),
    kind: input.kind,
    text: input.text.trim(),
    sourceUrl: input.sourceUrl.trim(),
    status: "new",
    mediaMime: media?.type ?? "",
    mediaSize: media?.size ?? 0,
    duration: input.duration ?? 0,
    synced: false,
  };
  const d = await db();
  const tx = d.transaction(["ideas", "media"], "readwrite");
  await Promise.all([
    tx.objectStore("ideas").put(idea),
    media ? tx.objectStore("media").put(media, idea.id) : Promise.resolve(),
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

export async function removeIdea(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["ideas", "media"], "readwrite");
  await Promise.all([tx.objectStore("ideas").delete(id), tx.objectStore("media").delete(id), tx.done]);
  ideas.value = ideas.value.filter((i) => i.id !== id);
}

export async function getMedia(id: string): Promise<Blob | undefined> {
  return (await db()).get("media", id);
}
