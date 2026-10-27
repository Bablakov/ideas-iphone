import { useState } from "preact/hooks";
import {
  applyFilter, formatDuration, formatTime, groupByDay, ideaTitle, type Filter,
} from "../core/format";
import { ideas } from "../core/store";
import type { Idea } from "../core/types";
import { Icon, type IconName } from "./Icon";
import { openId } from "./state";

const KIND_ICON: Record<Idea["kind"], IconName> = { audio: "mic", video: "video", text: "note" };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "new", label: "Необработанные" },
  { id: "processed", label: "Обработанные" },
];

function Row({ idea }: { idea: Idea }) {
  const meta = [formatTime(idea.created)];
  if (idea.kind !== "text" && idea.duration > 0) meta.push(formatDuration(idea.duration));
  if (idea.sourceUrl) meta.push("ссылка");
  return (
    <button class="row" onClick={() => (openId.value = idea.id)}>
      <span class={`row-icon ${idea.status}`}>
        <Icon name={KIND_ICON[idea.kind]} size={20} />
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
    </button>
  );
}

export function HistoryScreen() {
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState("");
  const groups = groupByDay(applyFilter(ideas.value, filter, day));

  return (
    <div class="screen history">
      <div class="filters">
        {FILTERS.map((f) => (
          <button class={`chip${filter === f.id ? " on" : ""}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div class="day-pick">
        <label>
          День
          <input type="date" value={day} onInput={(e) => setDay((e.currentTarget as HTMLInputElement).value)} />
        </label>
        {day && (
          <button class="link" onClick={() => setDay("")}>
            Сбросить
          </button>
        )}
      </div>

      <div class="list">
        {groups.length === 0 && (
          <div class="empty">{ideas.value.length === 0 ? "Пока пусто — запиши первую идею" : "Ничего не найдено"}</div>
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
