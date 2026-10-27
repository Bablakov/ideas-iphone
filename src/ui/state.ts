import { signal } from "@preact/signals";

export type Tab = "new" | "history" | "archive" | "settings";

export const tab = signal<Tab>("new");

/** id записи, открытой в карточке; null — карточка закрыта. */
export const openId = signal<string | null>(null);

export const toastMsg = signal("");

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Короткое всплывающее сообщение внизу экрана. */
export function toast(msg: string): void {
  toastMsg.value = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = ""), 2600);
}
