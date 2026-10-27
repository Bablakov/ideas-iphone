import { blobToBase64 } from "./chunks";

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export interface TreeEntry {
  path: string;
  mode: "100644";
  type: "blob";
  /** null удаляет файл из дерева. */
  sha: string | null;
}

export class GithubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Ветка сдвинулась, пока мы отправляли: надо начать синхронизацию заново. */
export class ConflictError extends Error {}

const API = "https://api.github.com";

function explain(status: number, detail: string): string {
  if (status === 401) return "Токен не подошёл — проверь, не истёк ли он";
  if (status === 403) return "GitHub отказал: у токена нет прав или исчерпан лимит запросов";
  if (status === 404) return "Репозиторий или ветка не найдены (или у токена нет к ним доступа)";
  return `GitHub ответил ${status}${detail ? `: ${detail}` : ""}`;
}

async function request(ref: RepoRef, path: string, init: RequestInit = {}, accept = "application/vnd.github+json") {
  const headers: Record<string, string> = { Authorization: `Bearer ${ref.token}`, Accept: accept };
  if (init.body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API}/repos/${ref.owner}/${ref.repo}${path}`, { ...init, headers });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { message?: string }).message ?? "";
    } catch {
      /* тело не JSON */
    }
    throw new GithubError(res.status, explain(res.status, detail));
  }
  return res;
}

const post = (ref: RepoRef, path: string, body: unknown) =>
  request(ref, path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

/** Коммит и дерево, на которые сейчас указывает ветка. */
export async function getHead(ref: RepoRef): Promise<{ commit: string; tree: string }> {
  const r = (await (await request(ref, `/git/ref/heads/${encodeURI(ref.branch)}`)).json()) as { object: { sha: string } };
  const c = (await (await request(ref, `/git/commits/${r.object.sha}`)).json()) as { tree: { sha: string } };
  return { commit: r.object.sha, tree: c.tree.sha };
}

export interface RemoteEntry {
  path: string;
  type: string;
  sha: string;
}

export async function getTree(ref: RepoRef, treeSha: string): Promise<RemoteEntry[]> {
  const t = (await (await request(ref, `/git/trees/${treeSha}?recursive=1`)).json()) as {
    tree: RemoteEntry[];
    truncated: boolean;
  };
  if (t.truncated) throw new Error("В репозитории слишком много файлов для одной синхронизации");
  return t.tree;
}

/** Читать безопасно повторять: на мобильной сети долгое скачивание иногда обрывается на полпути. */
async function retryRead<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      // Ошибки GitHub (нет доступа, нет файла) повторять бессмысленно — только оборванное соединение.
      if (e instanceof GithubError || attempt >= tries) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

export function getBlobBytes(ref: RepoRef, sha: string): Promise<ArrayBuffer> {
  return retryRead(async () =>
    (await request(ref, `/git/blobs/${sha}`, {}, "application/vnd.github.raw+json")).arrayBuffer(),
  );
}

export async function getBlobText(ref: RepoRef, sha: string): Promise<string> {
  return new TextDecoder().decode(await getBlobBytes(ref, sha));
}

export async function createTextBlob(ref: RepoRef, text: string): Promise<string> {
  return ((await post(ref, "/git/blobs", { content: text, encoding: "utf-8" })) as { sha: string }).sha;
}

export async function createBinaryBlob(ref: RepoRef, data: Blob): Promise<string> {
  return ((await post(ref, "/git/blobs", { content: await blobToBase64(data), encoding: "base64" })) as { sha: string }).sha;
}

/** Один коммит поверх `head`, который меняет только перечисленные файлы. Возвращает новую голову ветки. */
export async function commitChanges(
  ref: RepoRef,
  head: { commit: string; tree: string },
  entries: TreeEntry[],
  message: string,
): Promise<{ commit: string; tree: string }> {
  const tree = ((await post(ref, "/git/trees", { base_tree: head.tree, tree: entries })) as { sha: string }).sha;
  const commit = ((await post(ref, "/git/commits", { message, tree, parents: [head.commit] })) as { sha: string }).sha;
  try {
    await request(ref, `/git/refs/heads/${encodeURI(ref.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit, force: false }),
    });
  } catch (e) {
    if (e instanceof GithubError && e.status === 422) throw new ConflictError("Ветка изменилась во время отправки");
    throw e;
  }
  return { commit, tree };
}

/** Проверка из настроек: репозиторий виден, ветка есть, запись разрешена. */
export async function checkAccess(ref: RepoRef): Promise<{ ok: boolean; message: string }> {
  try {
    const repo = (await (await request(ref, "")).json()) as { permissions?: { push?: boolean }; private?: boolean };
    if (!repo.permissions?.push) {
      return { ok: false, message: "Репозиторий виден, но писать в него токену нельзя — нужно право Contents: Read and write" };
    }
    await getHead(ref);
    return {
      ok: true,
      message: repo.private ? "Всё в порядке: доступ на запись есть, репозиторий приватный" : "Доступ есть, но репозиторий ПУБЛИЧНЫЙ — записи будут видны всем",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Не удалось проверить доступ" };
  }
}
