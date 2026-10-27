import type { Idea, IdeaStatus } from "./types";

/** Часть файла в репозитории. */
export interface PartInfo {
  name: string;
  size: number;
  sha256: string;
}

export interface RemoteMedia {
  mime: string;
  size: number;
  duration: number;
  parts: PartInfo[];
}

/**
 * Содержимое `inbox/<id>/item.json`. Этот же формат читает воркер на ПК:
 * он дописывает транскрипт и меняет status, поэтому поле updated обязательно.
 */
export interface ItemJson {
  v: 1;
  id: string;
  created: number;
  updated: number;
  text: string;
  sourceUrl: string;
  status: IdeaStatus;
  /** Надгробие: карточка удалена. */
  deleted?: true;
  audio?: RemoteMedia;
  video?: RemoteMedia;
}

export function toItemJson(idea: Idea, media: { audio?: RemoteMedia; video?: RemoteMedia } = {}): ItemJson {
  const item: ItemJson = {
    v: 1,
    id: idea.id,
    created: idea.created,
    updated: idea.updated,
    text: idea.deleted ? "" : idea.text,
    sourceUrl: idea.deleted ? "" : idea.sourceUrl,
    status: idea.status,
  };
  if (idea.deleted) item.deleted = true;
  else {
    if (media.audio) item.audio = media.audio;
    if (media.video) item.video = media.video;
  }
  return item;
}

const STATUSES: readonly string[] = ["new", "processed", "archived"];

function parseMedia(raw: unknown): RemoteMedia | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const m = raw as Partial<RemoteMedia>;
  if (!Array.isArray(m.parts) || m.parts.length === 0) throw new Error("item.json: у медиа нет частей");
  return {
    mime: String(m.mime ?? ""),
    size: Number(m.size ?? 0),
    duration: Number(m.duration ?? 0),
    parts: m.parts.map((p) => ({ name: String(p.name), size: Number(p.size), sha256: String(p.sha256) })),
  };
}

/** Разбирает и проверяет item.json. Бросает понятную ошибку, если файл повреждён или написан чужой версией. */
export function parseItemJson(text: string): ItemJson {
  const raw = JSON.parse(text) as Partial<ItemJson>;
  if (raw.v !== 1) throw new Error("item.json: неизвестная версия формата");
  if (typeof raw.id !== "string" || !raw.id) throw new Error("item.json: нет id");
  if (typeof raw.created !== "number" || typeof raw.updated !== "number") throw new Error("item.json: нет дат");
  if (!STATUSES.includes(String(raw.status))) throw new Error("item.json: неизвестный статус");
  const item: ItemJson = {
    v: 1,
    id: raw.id,
    created: raw.created,
    updated: raw.updated,
    text: String(raw.text ?? ""),
    sourceUrl: String(raw.sourceUrl ?? ""),
    status: raw.status as IdeaStatus,
  };
  if (raw.deleted) item.deleted = true;
  const audio = parseMedia(raw.audio);
  const video = parseMedia(raw.video);
  if (audio) item.audio = audio;
  if (video) item.video = video;
  return item;
}

/** Нужно ли скачивать item.json: мы его ещё не видели или он изменился с прошлого раза. */
export function needsRemoteFetch(local: Idea | undefined, remoteSha: string): boolean {
  return !local || local.remoteSha !== remoteSha;
}

/**
 * Что делать с карточкой. `remote` — свежий item.json, если он новый для нас; undefined — в репозитории
 * ничего не менялось (или карточки там нет). Побеждает более поздний `updated`.
 *
 *  - push  — отправить локальную версию
 *  - pull  — взять версию из репозитория
 *  - adopt — версии совпадают, достаточно запомнить sha
 *  - purge — стереть локальную запись совсем
 *  - skip / noop — ничего не делать
 */
export type Plan = "push" | "pull" | "adopt" | "purge" | "skip" | "noop";

export function planFor(local: Idea | undefined, remote: ItemJson | undefined): Plan {
  if (!remote) return local && !local.synced ? "push" : "noop";
  if (!local) return remote.deleted ? "skip" : "pull";
  if (remote.updated > local.updated) return remote.deleted ? "purge" : "pull";
  if (remote.updated === local.updated) return "adopt";
  return "push";
}
