import { signal } from "@preact/signals";
import type { RepoRef } from "./github";

export interface SyncConfig {
  /** `владелец/репозиторий` или ссылка на репозиторий. */
  repo: string;
  branch: string;
  token: string;
}

const KEY = "ideas.sync";

const DEFAULTS: SyncConfig = { repo: "Bablakov/ideas-data", branch: "main", token: "" };

function load(): SyncConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<SyncConfig>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const config = signal<SyncConfig>(load());

export function saveConfig(next: SyncConfig): void {
  config.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* хранилище недоступно — настройки проживут до закрытия приложения */
  }
}

/** Принимает `owner/repo`, `https://github.com/owner/repo` и вариант с `.git` на конце. */
export function parseRepo(input: string): { owner: string; repo: string } | undefined {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], repo: m[2] } : undefined;
}

/** Готовые параметры для запросов или undefined, если синхронизация не настроена. */
export function repoRef(c: SyncConfig = config.value): RepoRef | undefined {
  const r = parseRepo(c.repo);
  const token = c.token.trim();
  const branch = c.branch.trim() || "main";
  return r && token ? { ...r, branch, token } : undefined;
}
