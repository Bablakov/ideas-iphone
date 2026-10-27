import { afterEach, describe, expect, it, vi } from "vitest";
import { ConflictError, GithubError, commitChanges, type RepoRef, type TreeEntry } from "./github";

const ref: RepoRef = { owner: "o", repo: "r", branch: "main", token: "t" };
const entries: TreeEntry[] = [{ path: "inbox/a/item.json", mode: "100644", type: "blob", sha: "blob1" }];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  method: string;
  url: string;
  body: Record<string, unknown>;
}

/**
 * Поддельный GitHub: ветка `main` указывает на commit-0. Каждый PATCH ref берёт ответ из очереди `patches`.
 * Новые деревья и коммиты получают номера, чтобы видеть, от чего считается следующий.
 */
function fakeGithub(patches: Response[], headAfterConflict = "commit-9") {
  const calls: Call[] = [];
  let n = 0;
  vi.stubGlobal("setTimeout", (fn: () => void) => {
    fn();
    return 0;
  });
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ method, url, body });
    if (method === "POST" && url.endsWith("/git/trees")) return json({ sha: `tree-${++n}` });
    if (method === "POST" && url.endsWith("/git/commits")) return json({ sha: `commit-${++n}` });
    if (method === "PATCH") return patches.shift() ?? json({});
    if (url.includes("/git/ref/heads/")) return json({ object: { sha: headAfterConflict } });
    if (url.includes("/git/commits/")) return json({ tree: { sha: `tree-of-${headAfterConflict}` } });
    throw new Error(`неожиданный запрос ${method} ${url}`);
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("commitChanges", () => {
  it("без конфликта — один коммит поверх переданной головы", async () => {
    const calls = fakeGithub([json({})]);
    const head = await commitChanges(ref, { commit: "commit-0", tree: "tree-0" }, entries, "msg");
    expect(head.commit).toBe("commit-2");
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1);
    expect(calls.find((c) => c.url.endsWith("/git/commits"))?.body.parents).toEqual(["commit-0"]);
  });

  it("ветка сдвинулась — коммит пересобирается поверх свежей головы и проходит", async () => {
    const calls = fakeGithub([json({ message: "Update is not a fast forward" }, 422), json({})]);
    const head = await commitChanges(ref, { commit: "commit-0", tree: "tree-0" }, entries, "msg");

    const commits = calls.filter((c) => c.url.endsWith("/git/commits"));
    expect(commits).toHaveLength(2);
    expect(commits[0].body.parents).toEqual(["commit-0"]);
    expect(commits[1].body.parents).toEqual(["commit-9"]);
    const trees = calls.filter((c) => c.url.endsWith("/git/trees"));
    expect(trees[1].body.base_tree).toBe("tree-of-commit-9");
    // Те же файлы: повторная загрузка blob не нужна.
    expect(trees[1].body.tree).toEqual(entries);
    expect(head.commit).toBe(commits.length === 2 ? "commit-4" : "");
  });

  it("если ветка меняется без конца — понятная ошибка после 5 попыток", async () => {
    const moved = () => json({ message: "Update is not a fast forward" }, 422);
    const calls = fakeGithub([moved(), moved(), moved(), moved(), moved(), moved()]);
    await expect(commitChanges(ref, { commit: "commit-0", tree: "tree-0" }, entries, "msg")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(5);
  });

  it("другая ошибка 422 не выдаётся за конфликт ветки", async () => {
    fakeGithub([json({ message: "Object does not exist" }, 422)]);
    const err = await commitChanges(ref, { commit: "commit-0", tree: "tree-0" }, entries, "msg").catch((e) => e);
    expect(err).toBeInstanceOf(GithubError);
    expect((err as GithubError).detail).toBe("Object does not exist");
  });
});
