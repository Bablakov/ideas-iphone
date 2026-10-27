import { useEffect, useRef, useState } from "preact/hooks";
import { formatDuration, formatSize, formatTime, dayKey, dayLabel } from "../core/format";
import { getMedia, ideas, removeIdea, updateIdea } from "../core/store";
import type { Idea } from "../core/types";
import { Icon } from "./Icon";
import { openId, toast } from "./state";

const KIND_NAME: Record<Idea["kind"], string> = { audio: "Голос", video: "Видео", text: "Заметка" };

const isWebLink = (s: string) => /^https?:\/\//i.test(s.trim());

function SheetBody({ idea }: { idea: Idea }) {
  const [mediaUrl, setMediaUrl] = useState("");
  const [text, setText] = useState(idea.text);
  const [link, setLink] = useState(idea.sourceUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (idea.kind === "text") return;
    let objectUrl = "";
    let dead = false;
    void getMedia(idea.id).then((blob) => {
      if (!blob || dead) return;
      objectUrl = URL.createObjectURL(blob);
      setMediaUrl(objectUrl);
    });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [idea.id, idea.kind]);

  useEffect(() => () => clearTimeout(confirmTimer.current), []);

  async function persist(): Promise<void> {
    if (text.trim() !== idea.text || link.trim() !== idea.sourceUrl) {
      await updateIdea(idea.id, { text, sourceUrl: link });
    }
  }

  async function close() {
    await persist();
    openId.value = null;
  }

  async function toggleStatus() {
    await updateIdea(idea.id, {
      text,
      sourceUrl: link,
      status: idea.status === "new" ? "processed" : "new",
    });
    toast(idea.status === "new" ? "Помечено обработанной" : "Возвращено в необработанные");
  }

  async function onDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await removeIdea(idea.id);
    openId.value = null;
    toast("Удалено");
  }

  const when = `${dayLabel(dayKey(idea.created))}, ${formatTime(idea.created)}`;
  const meta = [KIND_NAME[idea.kind], when];
  if (idea.kind !== "text") meta.push(formatSize(idea.mediaSize));
  if (idea.kind === "audio" && idea.duration > 0) meta.push(formatDuration(idea.duration));

  return (
    <div class="sheet-back" onClick={close}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <span class="sheet-meta">{meta.join(" · ")}</span>
          <button class="link" onClick={close}>
            Готово
          </button>
        </div>

        {idea.kind === "audio" && mediaUrl && <audio controls src={mediaUrl} preload="metadata" />}
        {idea.kind === "video" && mediaUrl && <video controls playsInline src={mediaUrl} preload="metadata" />}

        <textarea
          rows={6}
          placeholder="Текст идеи…"
          value={text}
          onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)}
          onBlur={persist}
        />
        <div class="link-row">
          <input
            type="url"
            inputMode="url"
            placeholder="Ссылка на видео"
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

        <div class="actions">
          <button class="primary" onClick={toggleStatus}>
            <Icon name="check" size={18} />
            {idea.status === "new" ? "Обработана" : "Вернуть в необработанные"}
          </button>
          <button class={`danger${confirmDelete ? " armed" : ""}`} onClick={onDelete}>
            <Icon name="trash" size={18} />
            {confirmDelete ? "Точно удалить?" : "Удалить"}
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
