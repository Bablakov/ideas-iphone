import { useState } from "preact/hooks";
import {
  applyFilter, dayKey, formatDuration, formatTime, groupByDay, ideaTitle, type Filter,
} from "../core/format";
import { ideas } from "../core/store";
import type { Idea } from "../core/types";
import { Icon, type IconName } from "./Icon";
import { openId } from "./state";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "new", label: "Необработанные" },
  { id: "processed", label: "Обработанные" },
  { id: "archived", label: "Архив" },
];

/** Главная иконка строки — самое «весомое» вложение. */
function mainIcon(i: Idea): IconName {
  return i.video ? "video" : i.audio ? "mic" : "note";
}

function Row({ idea }: { idea: Idea }) {
  const meta = [formatTime(idea.created)];
  if (idea.audio) meta.push(`аудио ${formatDuration(idea.audio.duration)}`);
  if (idea.video) meta.push("видео");
  if (idea.sourceUrl) meta.push("ссылка");
  return (
    <button class="row" onClick={() => (openId.value = idea.id)}>
      <span class={`row-icon ${idea.status}`}>
        <Icon name={mainIcon(idea)} size={20} />
      </span>
      <span class="row-main">
        <span class="row-title">{ideaTitle(idea)}</span>
        <span class="row-meta">{meta.join(" · ")}</span>
      </span>
      {idea.status === "processed" && (
        <span class="row-done">
          <Icon name="check" size={18} />
        </span>
      )}
      {idea.status === "archived" && (
        <span class="row-arch">
          <Icon name="archive" size={18} />
        </span>
      )}
    </button>
  );
}

export function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  // По умолчанию показываем сегодняшний день; «Все дни» снимает ограничение.
  const [from, setFrom] = useState(() => dayKey(Date.now()));
  const [to, setTo] = useState(() => dayKey(Date.now()));
  const groups = groupByDay(applyFilter(ideas.value, filter, from, to));
  const anyRange = from !== "" || to !== "";
  const total = ideas.value.length;

  return (
    <div class="screen history">
      <div class="filters">
        {FILTERS.map((f) => (
          <button class={`chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      <div class="range">
        <label>
          С
          <input type="date" value={from} onInput={(e) => setFrom((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <label>
          по
          <input type="date" value={to} onInput={(e) => setTo((e.currentTarget as HTMLInputElement).value)} />
        </label>
        <button
          class="link"
          onClick={() => {
            if (anyRange) {
              setFrom("");
              setTo("");
            } else {
              setFrom(dayKey(Date.now()));
              setTo(dayKey(Date.now()));
            }
          }}
        >
          {anyRange ? "Все дни" : "Сегодня"}
        </button>
      </div>

      <div class="list">
        {groups.length === 0 && (
          <div class="empty">
            {total === 0
              ? "Пока пусто — создай первую карточку"
              : anyRange
                ? "За выбранные дни ничего нет. Нажми «Все дни», чтобы увидеть остальное."
                : "Ничего не найдено"}
          </div>
        )}
        {groups.map((g) => (
          <section>
            <h3 class="day">{g.label}</h3>
            {g.items.map((i) => (
              <Row key={i.id} idea={i} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
