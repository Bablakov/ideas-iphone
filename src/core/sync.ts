import { signal } from "@preact/signals";
import { joinParts, partName, sha256Hex, splitBlob } from "./chunks";
import {
  ConflictError, commitChanges, createBinaryBlob, createTextBlob, getBlobBytes, getBlobText, getHead, getTree,
  type RepoRef, type TreeEntry,
} from "./github";
import {
  needsRemoteFetch, parseItemJson, planFor, toItemJson, type ItemJson, type RemoteMedia,
} from "./manifest";
import { repoRef } from "./settings";
import { allRecords, getMedia, markSynced, purgeRecord, putRecord } from "./store";
import type { Idea, MediaKind } from "./types";

const LAST_KEY = "ideas.sync.last";
const KINDS: readonly MediaKind[] = ["audio", "video"];

export const syncState = signal({
  running: false,
  /** Что происходит прямо сейчас («Отправка 2 из 5»). */
  message: "",
  /** Текст последней ошибки; пусто, если всё хорошо. */
  error: "",
  /** Время последней удачной синхронизации, мс; 0 — ещё не было. */
  last: Number(safeGet(LAST_KEY)) || 0,
});

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* не критично */
  }
}

/** Что лежит в репозитории в папке одной карточки. */
interface RemoteDir {
  itemSha?: string;
  /** Имя файла → sha, кроме item.json. */
  files: Map<string, string>;
}

/** Раскладывает дерево репозитория по карточкам: `inbox/<id>/<файл>`. */
export function indexTree(entries: readonly { path: string; type: string; sha: string }[]): Map<string, RemoteDir> {
  const dirs = new Map<string, RemoteDir>();
  for (const e of entries) {
    if (e.type !== "blob") continue;
    const [root, id, name, ...rest] = e.path.split("/");
    if (root !== "inbox" || !id || !name || rest.length > 0) continue;
    let dir = dirs.get(id);
    if (!dir) dirs.set(id, (dir = { files: new Map() }));
    if (name === "item.json") dir.itemSha = e.sha;
    else dir.files.set(name, e.sha);
  }
  return dirs;
}

const base = (id: string) => `inbox/${id}/`;

/** Режет локальный файл и считает контрольные суммы; сами части возвращает для загрузки. */
async function describeMedia(id: string, kind: MediaKind, idea: Idea) {
  const info = idea[kind];
  if (!info) return undefined;
  const blob = await getMedia(id, kind);
  if (!blob) throw new Error(`Нет файла ${kind} у карточки ${id.slice(0, 8)}`);
  const blobs = splitBlob(blob);
  const parts = await Promise.all(
    blobs.map(async (b, i) => ({ name: partName(kind, i), size: b.size, sha256: await sha256Hex(b) })),
  );
  const media: RemoteMedia = { mime: blob.type || info.mime, size: blob.size, duration: info.duration, parts };
  return { media, blobs };
}

type Head = { commit: string; tree: string };

/** Отправляет одну карточку (или её надгробие) одним коммитом. */
async function push(ref: RepoRef, head: Head, local: Idea, remote: RemoteDir | undefined): Promise<Head> {
  const entries: TreeEntry[] = [];
  const media: { audio?: RemoteMedia; video?: RemoteMedia } = {};

  if (local.deleted) {
    // Файлы стираем, а item.json остаётся надгробием — по нему другие устройства узнают об удалении.
    for (const name of remote?.files.keys() ?? []) {
      entries.push({ path: base(local.id) + name, mode: "100644", type: "blob", sha: null });
    }
  } else {
    for (const kind of KINDS) {
      const described = await describeMedia(local.id, kind, local);
      if (!described) continue;
      media[kind] = described.media;
      for (const [i, part] of described.blobs.entries()) {
        const name = partName(kind, i);
        // Файлы не меняются после создания: если часть уже лежит в репозитории, повторно не грузим.
        if (remote?.files.has(name)) continue;
        entries.push({ path: base(local.id) + name, mode: "100644", type: "blob", sha: await createBinaryBlob(ref, part) });
      }
    }
  }

  const itemSha = await createTextBlob(ref, JSON.stringify(toItemJson(local, media), null, 2) + "\n");
  entries.push({ path: `${base(local.id)}item.json`, mode: "100644", type: "blob", sha: itemSha });

  const next = await commitChanges(ref, head, entries, `${local.deleted ? "Удалена" : "Карточка"} ${local.id.slice(0, 8)}`);
  if (local.deleted) await purgeRecord(local.id);
  else await markSynced(local.id, itemSha, local.updated);
  return next;
}

/** Скачивает версию из репозитория и записывает её на устройство. */
async function pull(ref: RepoRef, item: ItemJson, itemSha: string, remote: RemoteDir, local: Idea | undefined) {
  const files: { audio?: Blob; video?: Blob } = {};
  for (const kind of KINDS) {
    const m = item[kind];
    if (!m) continue;
    // Уже есть такой же файл — не качаем заново.
    if (local?.[kind] && local[kind].size === m.size) continue;
    const parts: Blob[] = [];
    for (const p of m.parts) {
      const sha = remote.files.get(p.name);
      if (!sha) throw new Error(`В репозитории нет файла ${p.name} карточки ${item.id.slice(0, 8)}`);
      const bytes = await getBlobBytes(ref, sha);
      if (bytes.byteLength !== p.size || (await sha256Hex(bytes)) !== p.sha256) {
        throw new Error(`Файл ${p.name} карточки ${item.id.slice(0, 8)} повреждён`);
      }
      parts.push(new Blob([bytes]));
    }
    files[kind] = joinParts(parts, m.mime);
  }

  const idea: Idea = {
    id: item.id,
    created: item.created,
    updated: item.updated,
    text: item.text,
    sourceUrl: item.sourceUrl,
    status: item.status,
    synced: true,
    remoteSha: itemSha,
  };
  for (const kind of KINDS) {
    const m = item[kind];
    if (m) idea[kind] = { mime: m.mime, size: m.size, duration: m.duration };
  }
  await putRecord(idea, files);
}

interface Counters {
  pushed: number;
  pulled: number;
}

async function runOnce(ref: RepoRef): Promise<Counters> {
  let head = await getHead(ref);
  const remote = indexTree(await getTree(ref, head.tree));
  const locals = new Map((await allRecords()).map((i) => [i.id, i]));
  const counters: Counters = { pushed: 0, pulled: 0 };

  const ids = [...new Set([...remote.keys(), ...locals.keys()])];
  for (const [n, id] of ids.entries()) {
    const local = locals.get(id);
    const dir = remote.get(id);
    syncState.value = { ...syncState.value, message: `Синхронизация ${n + 1} из ${ids.length}` };

    // Надгробие, которого в репозитории уже нет, отправлять незачем.
    if (local?.deleted && !dir?.itemSha) {
      await purgeRecord(id);
      continue;
    }

    let item: ItemJson | undefined;
    if (dir?.itemSha && needsRemoteFetch(local, dir.itemSha)) {
      item = parseItemJson(await getBlobText(ref, dir.itemSha));
    }

    switch (planFor(local, item)) {
      case "push":
        head = await push(ref, head, local!, dir);
        counters.pushed++;
        break;
      case "pull":
        await pull(ref, item!, dir!.itemSha!, dir!, local);
        counters.pulled++;
        break;
      case "adopt":
        if (local!.deleted) await purgeRecord(id);
        else await markSynced(id, dir!.itemSha!, local!.updated);
        break;
      case "purge":
        await purgeRecord(id);
        counters.pulled++;
        break;
      default:
        break;
    }
  }
  return counters;
}

let running = false;

/** Полная синхронизация. Безопасно вызывать часто: параллельные вызовы игнорируются. */
export async function syncNow(): Promise<void> {
  const ref = repoRef();
  if (!ref || running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  running = true;
  syncState.value = { ...syncState.value, running: true, message: "Подключение…", error: "" };
  try {
    let counters: Counters;
    try {
      counters = await runOnce(ref);
    } catch (e) {
      // Пока мы отправляли, ветку сдвинули (например, воркер на ПК) — один повтор с актуальной веткой.
      if (!(e instanceof ConflictError)) throw e;
      counters = await runOnce(ref);
    }
    const last = Date.now();
    safeSet(LAST_KEY, String(last));
    syncState.value = {
      running: false,
      last,
      error: "",
      message: `Отправлено: ${counters.pushed}, получено: ${counters.pulled}`,
    };
  } catch (e) {
    syncState.value = {
      ...syncState.value,
      running: false,
      message: "",
      error: e instanceof Error ? e.message : "Синхронизация не удалась",
    };
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Запуск с задержкой: серия быстрых правок превращается в одну синхронизацию. */
export function scheduleSync(delayMs = 3000): void {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}
