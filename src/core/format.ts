import type { Idea } from "./types";

export type Filter = "all" | "new" | "processed";

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

/** Фильтр по статусу и (необязательно) по конкретному дню «YYYY-MM-DD». */
export function applyFilter(list: readonly Idea[], filter: Filter, day: string = ""): Idea[] {
  return list.filter((i) => (filter === "all" || i.status === filter) && (!day || dayKey(i.created) === day));
}

/** Заголовок строки списка: первая строка текста либо тип записи. */
export function ideaTitle(i: Idea): string {
  const first = i.text.trim().split("\n")[0];
  if (first) return first;
  if (i.kind === "audio") return `Голосовая заметка ${formatDuration(i.duration)}`;
  if (i.kind === "video") return "Видео";
  return "Пустая заметка";
}
