import type { Idea } from "./types";

/** all — всё, кроме архива; остальные — ровно один статус. */
export type Filter = "all" | "new" | "processed" | "archived";

const pad = (n: number) => String(n).padStart(2, "0");

/** Локальный день записи в виде «2026-10-27» — по нему группируем и фильтруем. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «Сегодня», «Вчера» или «27 октября» (с годом, если он не текущий). */
export function dayLabel(key: string, now: number = Date.now()): string {
  if (key === dayKey(now)) return "Сегодня";
  if (key === dayKey(now - 86_400_000)) return "Вчера";
  const [y, m, d] = key.split("-").map(Number);
  const year = y === new Date(now).getFullYear() ? "" : ` ${y}`;
  return `${d} ${MONTHS[m - 1]}${year}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 75 → «1:15». */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export interface DayGroup {
  key: string;
  label: string;
  items: Idea[];
}

/** Группирует записи по дням; внутри дня и между днями — от новых к старым. */
export function groupByDay(list: readonly Idea[], now: number = Date.now()): DayGroup[] {
  const sorted = [...list].sort((a, b) => b.created - a.created);
  const groups: DayGroup[] = [];
  for (const idea of sorted) {
    const key = dayKey(idea.created);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(idea);
    else groups.push({ key, label: dayLabel(key, now), items: [idea] });
  }
  return groups;
}

/**
 * Фильтр по статусу и по диапазону дней «YYYY-MM-DD» (границы включительно, пустая — без ограничения).
 * Если границы перепутаны местами, они меняются сами.
 */
export function applyFilter(list: readonly Idea[], filter: Filter, from: string = "", to: string = ""): Idea[] {
  const [lo, hi] = from && to && from > to ? [to, from] : [from, to];
  return list.filter((i) => {
    if (filter === "all" ? i.status === "archived" : i.status !== filter) return false;
    const day = dayKey(i.created);
    return (!lo || day >= lo) && (!hi || day <= hi);
  });
}

/** Заголовок строки списка: первая строка текста либо то, что вложено. */
export function ideaTitle(i: Idea): string {
  const first = i.text.trim().split("\n")[0];
  if (first) return first;
  if (i.audio) return `Голос ${formatDuration(i.audio.duration)}`;
  if (i.video) return "Видео";
  if (i.sourceUrl) return i.sourceUrl;
  return "Пустая карточка";
}
