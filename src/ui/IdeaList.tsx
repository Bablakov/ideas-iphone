import { dayKey, formatDuration, formatTime, groupByDay, ideaTitle } from "../core/format";
import type { Idea } from "../core/types";
import { Icon, type IconName } from "./Icon";
import { openId } from "./state";

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

/** Карточки, сгруппированные по дням. */
export function DayList({ items, empty }: { items: readonly Idea[]; empty: string }) {
  const groups = groupByDay(items);
  return (
    <div class="list">
      {groups.length === 0 && <div class="empty">{empty}</div>}
      {groups.map((g) => (
        <section>
          <h3 class="day">{g.label}</h3>
          {g.items.map((i) => (
            <Row key={i.id} idea={i} />
          ))}
        </section>
      ))}
    </div>
  );
}

interface RangeProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

/** Выбор диапазона дат «с — по». Пустые границы — без ограничения. */
export function RangePicker({ from, to, onChange }: RangeProps) {
  const anyRange = from !== "" || to !== "";
  const today = dayKey(Date.now());
  return (
    <div class="range">
      <label>
        С
        <input type="date" value={from} onInput={(e) => onChange((e.currentTarget as HTMLInputElement).value, to)} />
      </label>
      <label>
        по
        <input type="date" value={to} onInput={(e) => onChange(from, (e.currentTarget as HTMLInputElement).value)} />
      </label>
      <button class="link" onClick={() => (anyRange ? onChange("", "") : onChange(today, today))}>
        {anyRange ? "Все дни" : "Сегодня"}
      </button>
    </div>
  );
}
