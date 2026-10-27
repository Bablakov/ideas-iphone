import { describe, expect, it } from "vitest";
import { joinParts, partName, sha256Hex, splitBlob } from "./chunks";
import { indexTree } from "./sync";
import { needsRemoteFetch, parseItemJson, planFor, toItemJson, type ItemJson } from "./manifest";
import { parseRepo } from "./settings";
import type { Idea } from "./types";

function idea(patch: Partial<Idea> = {}): Idea {
  return { id: "abc", created: 100, updated: 100, text: "t", sourceUrl: "", status: "new", synced: false, ...patch };
}

function remote(patch: Partial<ItemJson> = {}): ItemJson {
  return { v: 1, id: "abc", created: 100, updated: 100, text: "r", sourceUrl: "", status: "new", ...patch };
}

describe("planFor", () => {
  it("без изменений в репозитории отправляем только несинхронизированное", () => {
    expect(planFor(idea({ synced: false }), undefined)).toBe("push");
    expect(planFor(idea({ synced: true }), undefined)).toBe("noop");
    expect(planFor(undefined, undefined)).toBe("noop");
  });
  it("новая карточка из репозитория скачивается, удалённая пропускается", () => {
    expect(planFor(undefined, remote())).toBe("pull");
    expect(planFor(undefined, remote({ deleted: true }))).toBe("skip");
  });
  it("побеждает версия с более поздним updated", () => {
    expect(planFor(idea({ updated: 100 }), remote({ updated: 200 }))).toBe("pull");
    expect(planFor(idea({ updated: 300 }), remote({ updated: 200 }))).toBe("push");
  });
  it("одинаковый updated — версии совпадают", () => {
    expect(planFor(idea({ updated: 200 }), remote({ updated: 200 }))).toBe("adopt");
  });
  it("удаление в репозитории новее локальной правки стирает карточку", () => {
    expect(planFor(idea({ updated: 100 }), remote({ updated: 200, deleted: true }))).toBe("purge");
  });
  it("локальное надгробие новее версии в репозитории уходит наверх", () => {
    expect(planFor(idea({ updated: 300, deleted: true }), remote({ updated: 200 }))).toBe("push");
  });
});

describe("needsRemoteFetch", () => {
  it("скачиваем, если карточки нет или sha изменился", () => {
    expect(needsRemoteFetch(undefined, "s1")).toBe(true);
    expect(needsRemoteFetch(idea({ remoteSha: "s1" }), "s1")).toBe(false);
    expect(needsRemoteFetch(idea({ remoteSha: "s1" }), "s2")).toBe(true);
    expect(needsRemoteFetch(idea(), "s1")).toBe(true);
  });
});

describe("item.json", () => {
  it("туда и обратно без потерь", () => {
    const media = { mime: "audio/mp4", size: 5, duration: 2, parts: [{ name: "audio.000", size: 5, sha256: "ff" }] };
    const item = toItemJson(idea({ text: "привет", audio: { mime: "audio/mp4", size: 5, duration: 2 } }), { audio: media });
    expect(parseItemJson(JSON.stringify(item))).toEqual(item);
  });
  it("у надгробия нет текста и файлов", () => {
    const item = toItemJson(idea({ deleted: true, text: "секрет" }));
    expect(item).toMatchObject({ deleted: true, text: "" });
    expect(item.audio).toBeUndefined();
  });
  it("повреждённый файл отвергается понятной ошибкой", () => {
    expect(() => parseItemJson('{"v":2}')).toThrow("версия");
    expect(() => parseItemJson('{"v":1,"id":"a","created":1,"updated":1,"status":"???"}')).toThrow("статус");
    expect(() => parseItemJson('{"v":1,"id":"a","created":1,"updated":1,"status":"new","audio":{"parts":[]}}')).toThrow("частей");
  });
});

describe("части файла", () => {
  it("нарезка и склейка возвращают те же байты", async () => {
    const bytes = new Uint8Array(25).map((_, i) => i * 7);
    const blob = new Blob([bytes], { type: "audio/mp4" });
    const parts = splitBlob(blob, 10);
    expect(parts.map((p) => p.size)).toEqual([10, 10, 5]);
    const joined = joinParts(parts, "audio/mp4");
    expect(await sha256Hex(joined)).toBe(await sha256Hex(blob));
    expect(joined.type).toBe("audio/mp4");
  });
  it("пустой файл — одна пустая часть, имена с тремя цифрами", () => {
    expect(splitBlob(new Blob([])).length).toBe(1);
    expect(partName("video", 12)).toBe("video.012");
  });
  it("sha256 известного значения", async () => {
    expect(await sha256Hex(new Blob(["abc"]))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("indexTree", () => {
  it("раскладывает файлы по карточкам и игнорирует лишнее", () => {
    const dirs = indexTree([
      { path: "inbox/.gitkeep", type: "blob", sha: "k" },
      { path: "inbox/a", type: "tree", sha: "t" },
      { path: "inbox/a/item.json", type: "blob", sha: "i1" },
      { path: "inbox/a/audio.000", type: "blob", sha: "p0" },
      { path: "inbox/b/item.json", type: "blob", sha: "i2" },
      { path: "README.md", type: "blob", sha: "r" },
      { path: "inbox/a/deep/x", type: "blob", sha: "x" },
    ]);
    expect([...dirs.keys()]).toEqual(["a", "b"]);
    expect(dirs.get("a")?.itemSha).toBe("i1");
    expect([...dirs.get("a")!.files]).toEqual([["audio.000", "p0"]]);
  });
});

describe("parseRepo", () => {
  it("понимает короткую и полную записи", () => {
    expect(parseRepo("Bablakov/ideas-data")).toEqual({ owner: "Bablakov", repo: "ideas-data" });
    expect(parseRepo("https://github.com/Bablakov/ideas-data.git")).toEqual({ owner: "Bablakov", repo: "ideas-data" });
    expect(parseRepo("не репозиторий")).toBeUndefined();
  });
});
