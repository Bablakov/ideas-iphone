import { useEffect, useRef, useState } from "preact/hooks";
import { dayKey, dayLabel, formatDuration, formatSize, formatTime } from "../core/format";
import { getMedia, ideas, removeIdea, updateIdea } from "../core/store";
import type { Idea, IdeaStatus } from "../core/types";
import { BlobMedia } from "./BlobMedia";
import { Icon } from "./Icon";
import { openId, toast } from "./state";

const isWebLink = (s: string) => /^https?:\/\//i.test(s.trim());

function SheetBody({ idea }: { idea: Idea }) {
  const [audio, setAudio] = useState<Blob>();
  const [video, setVideo] = useState<Blob>();
  const [text, setText] = useState(idea.text);
  const [linkOn, setLinkOn] = useState(idea.sourceUrl !== "");
  const [link, setLink] = useState(idea.sourceUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let dead = false;
    if (idea.audio) void getMedia(idea.id, "audio").then((b) => !dead && setAudio(b));
    if (idea.video) void getMedia(idea.id, "video").then((b) => !dead && setVideo(b));
    return () => {
      dead = true;
    };
  }, [idea.id, idea.audio, idea.video]);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  const currentLink = linkOn ? link.trim() : "";

  async function persist(): Promise<void> {
    if (text.trim() !== idea.text || currentLink !== idea.sourceUrl) {
      await updateIdea(idea.id, { text, sourceUrl: currentLink });
    }
  }

  async function close() {
    await persist();
    openId.value = null;
  }

  async function setStatus(status: IdeaStatus, message: string) {
    await updateIdea(idea.id, { text, sourceUrl: currentLink, status });
    toast(message);
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await removeIdea(idea.id);
    openId.value = null;
    toast("Удалено навсегда");
  }

  const meta = [`${dayLabel(dayKey(idea.created))}, ${formatTime(idea.created)}`];
  if (idea.audio) meta.push(`аудио ${formatDuration(idea.audio.duration)}`);
  if (idea.video) meta.push(`видео ${formatSize(idea.video.size)}`);

  const statusName: Record<IdeaStatus, string> = {
    new: "Необработанная",
    processed: "Обработана",
    archived: "В архиве",
  };

  return (
    <div class="sheet-back" onClick={close}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <span class="sheet-meta">
            {statusName[idea.status]} · {meta.join(" · ")}
          </span>
          <button class="link" onClick={close}>
            Готово
          </button>
        </div>

        {audio && <BlobMedia blob={audio} kind="audio" />}
        {video && <BlobMedia blob={video} kind="video" />}

        <textarea
          rows={6}
          placeholder="Текст идеи…"
          value={text}
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
          onBlur={persist}
        />
        <label class="check">
          <input
            type="checkbox"
            checked={linkOn}
            onChange={(e) => {
              setLinkOn((e.currentTarget as HTMLInputElement).checked);
              // Состояние обновится после рендера, поэтому сохраняем на следующем тике.
              setTimeout(() => void persist(), 0);
            }}
          />
          <span>Ссылка на видео</span>
        </label>
        {linkOn && (
          <div class="link-row">
            <input
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={link}
              onInput={(e) => setLink((e.currentTarget as HTMLInputElement).value)}
              onBlur={persist}
            />
            {isWebLink(link) && (
              <a class="link" href={link.trim()} target="_blank" rel="noopener noreferrer">
                Открыть
              </a>
            )}
          </div>
        )}

        <div class="actions">
          {idea.status === "new" && (
            <button class="primary" onClick={() => setStatus("processed", "Помечено обработанной")}>
              <Icon name="check" size={18} />
              Обработана
            </button>
          )}
          {idea.status === "processed" && (
            <button class="primary" onClick={() => setStatus("new", "Возвращено в необработанные")}>
              Вернуть в необработанные
            </button>
          )}
          {idea.status === "archived" && (
            <button class="primary" onClick={() => setStatus("new", "Достана из архива")}>
              Достать из архива
            </button>
          )}
          {idea.status !== "archived" && (
            <button class="secondary" onClick={() => setStatus("archived", "Отправлено в архив")}>
              <Icon name="archive" size={18} />В архив
            </button>
          )}
          <button class={`danger${confirmDelete ? " armed" : ""}`} onClick={onDelete}>
            <Icon name="trash" size={18} />
            {confirmDelete ? "Точно удалить навсегда?" : "Удалить навсегда"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function IdeaSheet() {
  const id = openId.value;
  const idea = id ? ideas.value.find((i) => i.id === id) : undefined;
  // key пересоздаёт тело при смене записи, чтобы поля подхватили её данные.
  return idea ? <SheetBody key={idea.id} idea={idea} /> : null;
}
