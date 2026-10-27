import { signal } from "@preact/signals";
import { db } from "./db";
import type { Idea, MediaInfo, MediaKind, NewIdea } from "./types";

/** Видимые записи (без надгробий), от новых к старым. */
export const ideas = signal<Idea[]>([]);
export const ready = signal(false);

/** Растёт при каждой правке пользователя — по нему запускается автосинхронизация. */
export const changed = signal(0);

const byNewest = (a: Idea, b: Idea) => b.created - a.created;

const mediaKey = (id: string, kind: MediaKind) => `${id}:${kind}`;

function newId(): string {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Обновляет список на экране: надгробия не показываем. */
function showInList(idea: Idea): void {
  const rest = ideas.value.filter((i) => i.id !== idea.id);
  ideas.value = idea.deleted ? rest : [...rest, idea].sort(byNewest);
}

export async function initStore(): Promise<void> {
  const all = await (await db()).getAll("ideas");
  ideas.value = all.filter((i) => !i.deleted).sort(byNewest);
  ready.value = true;
}

function info(blob: Blob, duration: number): MediaInfo {
  return { mime: blob.type, size: blob.size, duration };
}

/** Сохраняет карточку (и файлы, если есть) одной транзакцией — либо всё, либо ничего. */
export async function addIdea(input: NewIdea): Promise<Idea> {
  const now = Date.now();
  const idea: Idea = {
    id: newId(),
    created: now,
    updated: now,
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
  showInList(idea);
  changed.value++;
  return idea;
}

/** Правка текста, ссылки и статуса. Помечает запись «не отправленной» и обновляет время правки. */
export async function updateIdea(
  id: string,
  patch: Partial<Pick<Idea, "text" | "sourceUrl" | "status">>,
): Promise<void> {
  const current = ideas.value.find((i) => i.id === id);
  if (!current) return;
  // Время строго растёт, даже если две правки пришлись на одну миллисекунду.
  const next: Idea = { ...current, ...patch, synced: false, updated: Math.max(Date.now(), current.updated + 1) };
  next.text = next.text.trim();
  next.sourceUrl = next.sourceUrl.trim();
  await (await db()).put("ideas", next);
  showInList(next);
  changed.value++;
}

/**
 * Удаление насквозь вместе с файлами. Для «убрать, но сохранить» есть статус archived.
 * Если карточка уже попадала в репозиторий, остаётся надгробие — иначе другое устройство вернёт её обратно.
 */
export async function removeIdea(id: string): Promise<void> {
  const d = await db();
  const current = await d.get("ideas", id);
  if (!current) return;
  const tx = d.transaction(["ideas", "media"], "readwrite");
  const media = tx.objectStore("media");
  const store = tx.objectStore("ideas");
  const tombstone: Idea | undefined = current.remoteSha
    ? {
        id,
        created: current.created,
        updated: Math.max(Date.now(), current.updated + 1),
        text: "",
        sourceUrl: "",
        status: current.status,
        synced: false,
        remoteSha: current.remoteSha,
        deleted: true,
      }
    : undefined;
  await Promise.all([
    tombstone ? store.put(tombstone) : store.delete(id),
    media.delete(mediaKey(id, "audio")),
    media.delete(mediaKey(id, "video")),
    tx.done,
  ]);
  ideas.value = ideas.value.filter((i) => i.id !== id);
  changed.value++;
}

export async function getMedia(id: string, kind: MediaKind): Promise<Blob | undefined> {
  return (await db()).get("media", mediaKey(id, kind));
}

// ---------- для синхронизации (не считаются правкой пользователя) ----------

/** Все записи, включая надгробия. */
export async function allRecords(): Promise<Idea[]> {
  return (await db()).getAll("ideas");
}

/** Записывает версию из репозитория; переданные файлы кладёт рядом. */
export async function putRecord(idea: Idea, files: { audio?: Blob; video?: Blob } = {}): Promise<void> {
  const d = await db();
  const tx = d.transaction(["ideas", "media"], "readwrite");
  const media = tx.objectStore("media");
  await Promise.all([
    tx.objectStore("ideas").put(idea),
    files.audio ? media.put(files.audio, mediaKey(idea.id, "audio")) : Promise.resolve(),
    files.video ? media.put(files.video, mediaKey(idea.id, "video")) : Promise.resolve(),
    tx.done,
  ]);
  showInList(idea);
}

/** Стирает запись и файлы совсем (после отправки надгробия или при удалении на другом устройстве). */
export async function purgeRecord(id: string): Promise<void> {
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

/**
 * Запоминает sha отправленного item.json. Карточка считается синхронизированной, только если за время
 * отправки её не успели поправить (`updated` не изменился).
 */
export async function markSynced(id: string, remoteSha: string, updatedSnapshot: number): Promise<void> {
  const d = await db();
  const current = await d.get("ideas", id);
  if (!current) return;
  const next: Idea = { ...current, remoteSha, synced: current.updated === updatedSnapshot };
  await d.put("ideas", next);
  showInList(next);
}

/**
 * Делает версию на этом устройстве «самой свежей» (новое время правки) и помечает её неотправленной.
 * Нужно для принудительной отправки: иначе другое устройство со своим более поздним `updated`
 * при следующей синхронизации вернуло бы свою версию обратно.
 */
export async function touchIdea(id: string): Promise<Idea | undefined> {
  const d = await db();
  const current = await d.get("ideas", id);
  if (!current) return undefined;
  const next: Idea = { ...current, updated: Math.max(Date.now(), current.updated + 1), synced: false };
  await d.put("ideas", next);
  showInList(next);
  return next;
}
