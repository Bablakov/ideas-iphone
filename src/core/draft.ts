import { signal } from "@preact/signals";
import { db, type DraftMeta } from "./db";
import { addIdea } from "./store";
import type { Idea } from "./types";

/**
 * Черновик новой карточки. Хранится в IndexedDB, поэтому записанное аудио и выбранное видео
 * переживают закрытие приложения, пока карточка не сохранена кнопкой.
 */
export interface Draft {
  text: string;
  sourceUrl: string;
  /** Включена ли ссылка на видео (галочка). Выключенная ссылка в карточку не попадает. */
  linkOn: boolean;
  audio?: { blob: Blob; duration: number };
  video?: { blob: Blob };
}

const empty = (): Draft => ({ text: "", sourceUrl: "", linkOn: false });

export const draft = signal<Draft>(empty());

/** Ссылка, которая реально попадёт в карточку. */
export function effectiveLink(d: Draft): string {
  return d.linkOn ? d.sourceUrl.trim() : "";
}

/** В карточке должно быть хоть что-то: текст, аудио, видео или ссылка. */
export function isDraftEmpty(d: Draft): boolean {
  return !d.text.trim() && !d.audio && !d.video && !effectiveLink(d);
}

// ---------- сохранение в IndexedDB (ошибки не критичны: черновик — страховка) ----------

let metaTimer: ReturnType<typeof setTimeout> | undefined;

async function persistMeta(): Promise<void> {
  const d = draft.value;
  const meta: DraftMeta = {
    text: d.text,
    sourceUrl: d.sourceUrl,
    linkOn: d.linkOn,
    audioDuration: d.audio?.duration ?? 0,
  };
  try {
    await (await db()).put("draft", meta, "meta");
  } catch (e) {
    console.warn("draft meta not saved", e);
  }
}

/** Текст пишется на каждое нажатие, поэтому в базу уходит с задержкой. */
function scheduleMeta(): void {
  clearTimeout(metaTimer);
  metaTimer = setTimeout(() => void persistMeta(), 400);
}

/** Немедленно дописать черновик — вызывается, когда приложение уходит в фон. */
export function flushDraft(): void {
  clearTimeout(metaTimer);
  void persistMeta();
}

export async function loadDraft(): Promise<void> {
  try {
    const d = await db();
    const [meta, audio, video] = await Promise.all([d.get("draft", "meta"), d.get("draft", "audio"), d.get("draft", "video")]);
    const m = meta && !(meta instanceof Blob) ? meta : undefined;
    const next = empty();
    if (m) {
      next.text = m.text;
      next.sourceUrl = m.sourceUrl;
      next.linkOn = m.linkOn;
    }
    if (audio instanceof Blob) next.audio = { blob: audio, duration: m?.audioDuration ?? 0 };
    if (video instanceof Blob) next.video = { blob: video };
    draft.value = next;
  } catch (e) {
    console.warn("draft not loaded", e);
  }
}

export function patchDraft(p: Partial<Pick<Draft, "text" | "sourceUrl" | "linkOn">>): void {
  draft.value = { ...draft.value, ...p };
  scheduleMeta();
}

export async function setDraftAudio(blob: Blob, duration: number): Promise<void> {
  draft.value = { ...draft.value, audio: { blob, duration } };
  try {
    const d = await db();
    await d.put("draft", blob, "audio");
  } catch (e) {
    console.warn("draft audio not saved", e);
  }
  flushDraft();
}

export async function setDraftVideo(blob: Blob): Promise<void> {
  draft.value = { ...draft.value, video: { blob } };
  try {
    await (await db()).put("draft", blob, "video");
  } catch (e) {
    console.warn("draft video not saved", e);
  }
}

export async function clearDraftMedia(kind: "audio" | "video"): Promise<void> {
  const { [kind]: _removed, ...rest } = draft.value;
  draft.value = rest;
  try {
    await (await db()).delete("draft", kind);
  } catch (e) {
    console.warn("draft media not removed", e);
  }
  flushDraft();
}

/** Полностью очищает черновик (после сохранения карточки или по кнопке «Очистить»). */
export async function discardDraft(): Promise<void> {
  clearTimeout(metaTimer);
  draft.value = empty();
  try {
    const d = await db();
    const tx = d.transaction("draft", "readwrite");
    await Promise.all([tx.store.clear(), tx.done]);
  } catch (e) {
    console.warn("draft not cleared", e);
  }
}

/** Сохраняет черновик как карточку и очищает его. Бросает ошибку, если сохранить не удалось. */
export async function saveDraftAsIdea(): Promise<Idea> {
  const d = draft.value;
  if (isDraftEmpty(d)) throw new Error("Карточка пустая");
  const idea = await addIdea({
    text: d.text,
    sourceUrl: effectiveLink(d),
    audio: d.audio,
    video: d.video,
  });
  await discardDraft();
  return idea;
}
