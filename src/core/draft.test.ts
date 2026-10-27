import { describe, expect, it } from "vitest";
import { effectiveLink, isDraftEmpty, type Draft } from "./draft";

const base: Draft = { text: "", sourceUrl: "", linkOn: false };

describe("effectiveLink", () => {
  it("выключенная галочка скрывает ссылку", () => {
    expect(effectiveLink({ ...base, sourceUrl: "https://x.y", linkOn: false })).toBe("");
    expect(effectiveLink({ ...base, sourceUrl: " https://x.y ", linkOn: true })).toBe("https://x.y");
  });
});

describe("isDraftEmpty", () => {
  it("пустой, пока нет ни текста, ни файлов, ни включённой ссылки", () => {
    expect(isDraftEmpty(base)).toBe(true);
    expect(isDraftEmpty({ ...base, text: "  " })).toBe(true);
    expect(isDraftEmpty({ ...base, sourceUrl: "https://x.y" })).toBe(true);
  });
  it("непустой при любом содержимом", () => {
    expect(isDraftEmpty({ ...base, text: "идея" })).toBe(false);
    expect(isDraftEmpty({ ...base, sourceUrl: "https://x.y", linkOn: true })).toBe(false);
    expect(isDraftEmpty({ ...base, audio: { blob: new Blob(["a"]), duration: 1 } })).toBe(false);
    expect(isDraftEmpty({ ...base, video: { blob: new Blob(["v"]) } })).toBe(false);
  });
});
