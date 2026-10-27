import { useState } from "preact/hooks";
import { applyFilter } from "../core/format";
import { ideas } from "../core/store";
import { DayList, RangePicker } from "./IdeaList";

/** Архив: убранные с глаз карточки. Их можно достать обратно или удалить навсегда. */
export function ArchiveScreen() {
  // В архиве по умолчанию показываем всё, без ограничения по дням.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const items = applyFilter(ideas.value, "archived", from, to);
  const hasAny = ideas.value.some((i) => i.status === "archived");

  return (
    <div class="screen history">
      <RangePicker
        from={from}
        to={to}
        onChange={(a, b) => {
          setFrom(a);
          setTo(b);
        }}
      />
      <DayList
        items={items}
        empty={hasAny ? "За выбранные дни в архиве пусто" : "Архив пуст. Сюда попадают карточки, которые ты убрал, но не хочешь терять."}
      />
    </div>
  );
}
