import { useState } from "preact/hooks";
import { applyFilter, dayKey, type Filter } from "../core/format";
import { ideas } from "../core/store";
import { DayList, RangePicker } from "./IdeaList";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "new", label: "Необработанные" },
  { id: "processed", label: "Обработанные" },
];

export function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  // По умолчанию показываем сегодняшний день; «Все дни» снимает ограничение.
  const [from, setFrom] = useState(() => dayKey(Date.now()));
  const [to, setTo] = useState(() => dayKey(Date.now()));
  const items = applyFilter(ideas.value, filter, from, to);
  const anyRange = from !== "" || to !== "";
  const hasAny = ideas.value.some((i) => i.status !== "archived");

  const empty = !hasAny
    ? "Пока пусто — создай первую карточку"
    : anyRange
      ? "За выбранные дни ничего нет. Нажми «Все дни», чтобы увидеть остальное."
      : "Ничего не найдено";

  return (
    <div class="screen history">
      <div class="filters">
        {FILTERS.map((f) => (
          <button class={`chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <RangePicker
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      <DayList items={items} empty={empty} />
    </div>
  );
}
