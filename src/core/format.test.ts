import { describe, expect, it } from "vitest";
import { applyFilter, dayKey, dayLabel, formatDuration, groupByDay, ideaTitle } from "./format";
import type { Idea } from "./types";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

function idea(id: string, created: number, patch: Partial<Idea> = {}): Idea {
  return { id, created, text: "", sourceUrl: "", status: "new", synced: false, ...patch };
}

describe("dayLabel", () => {
  const now = at(2026, 10, 27);
  it("сегодня и вчера", () => {
    expect(dayLabel(dayKey(now), now)).toBe("Сегодня");
    expect(dayLabel(dayKey(at(2026, 10, 26)), now)).toBe("Вчера");
  });
  it("дата без года в текущем году и с годом в другом", () => {
    expect(dayLabel("2026-03-05", now)).toBe("5 марта");
    expect(dayLabel("2025-12-31", now)).toBe("31 декабря 2025");
  });
});

describe("formatDuration", () => {
  it("минуты и секунды", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(75)).toBe("1:15");
    expect(formatDuration(3599.6)).toBe("60:00");
  });
});

describe("groupByDay", () => {
  it("группирует по дням от новых к старым", () => {
    const now = at(2026, 10, 27);
    const list = [
      idea("a", at(2026, 10, 26, 9)),
      idea("b", at(2026, 10, 27, 8)),
      idea("c", at(2026, 10, 27, 18)),
    ];
    const groups = groupByDay(list, now);
    expect(groups.map((g) => g.label)).toEqual(["Сегодня", "Вчера"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["c", "b"]);
  });
});

describe("applyFilter", () => {
  const list = [
    idea("a", at(2026, 10, 27), { status: "new" }),
    idea("b", at(2026, 10, 27), { status: "processed" }),
    idea("c", at(2026, 10, 26), { status: "new" }),
    idea("d", at(2026, 10, 25), { status: "archived" }),
  ];
  const ids = (l: Idea[]) => l.map((i) => i.id);

  it("«все» не показывает архив, а «архив» показывает только его", () => {
    expect(ids(applyFilter(list, "all"))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilter(list, "archived"))).toEqual(["d"]);
  });
  it("по статусу", () => {
    expect(ids(applyFilter(list, "new"))).toEqual(["a", "c"]);
    expect(ids(applyFilter(list, "processed"))).toEqual(["b"]);
  });
  it("по одному дню и по диапазону включительно", () => {
    expect(ids(applyFilter(list, "all", "2026-10-26", "2026-10-26"))).toEqual(["c"]);
    expect(ids(applyFilter(list, "all", "2026-10-26", "2026-10-27"))).toEqual(["a", "b", "c"]);
    expect(ids(applyFilter(list, "archived", "2026-10-26", ""))).toEqual([]);
  });
  it("перепутанные границы меняются местами", () => {
    expect(ids(applyFilter(list, "all", "2026-10-27", "2026-10-26"))).toEqual(["a", "b", "c"]);
  });
});

describe("ideaTitle", () => {
  it("первая строка текста либо вложение", () => {
    expect(ideaTitle(idea("a", 0, { text: "Идея\nвторая строка" }))).toBe("Идея");
    expect(ideaTitle(idea("a", 0, { audio: { mime: "audio/mp4", size: 1, duration: 42 } }))).toBe("Голос 0:42");
    expect(ideaTitle(idea("a", 0, { video: { mime: "video/mp4", size: 1, duration: 0 } }))).toBe("Видео");
    expect(ideaTitle(idea("a", 0, { sourceUrl: "https://x.y" }))).toBe("https://x.y");
    expect(ideaTitle(idea("a", 0))).toBe("Пустая карточка");
  });
});
