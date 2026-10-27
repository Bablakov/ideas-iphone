import { signal } from "@preact/signals";

export type Tab = "record" | "history";

export const tab = signal<Tab>("record");

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
