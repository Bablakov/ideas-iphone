import { useEffect, useRef, useState } from "preact/hooks";
import { formatDuration } from "../core/format";
import { AudioRecorder } from "../core/recorder";
import { addIdea } from "../core/store";
import { Icon } from "./Icon";
import { openId, toast } from "./state";

const DRAFT_TEXT = "ideas.draft.text";
const DRAFT_LINK = "ideas.draft.link";

// Черновик живёт в localStorage: если приложение закроют, не дописав мысль, текст не пропадёт.
function loadDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* хранилище недоступно (приватный режим) — черновик просто не сохранится */
  }
}

function micError(e: unknown): string {
  if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
    return "Нет доступа к микрофону — разреши его в настройках";
  }
  return e instanceof Error ? e.message : "Не удалось начать запись";
}

export function RecordScreen() {
  const [text, setText] = useState(() => loadDraft(DRAFT_TEXT));
  const [link, setLink] = useState(() => loadDraft(DRAFT_LINK));
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const recorder = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(recorder.current?.elapsed() ?? 0), 250);
    return () => clearInterval(t);
  }, [recording]);

  const clearDraft = () => {
    setText("");
    setLink("");
    saveDraft(DRAFT_TEXT, "");
    saveDraft(DRAFT_LINK, "");
  };

  async function toggleRecord() {
    if (busy) return;
    if (!recording) {
      try {
        const r = new AudioRecorder();
        await r.start();
        recorder.current = r;
        setElapsed(0);
        setRecording(true);
      } catch (e) {
        toast(micError(e));
      }
      return;
    }
    setBusy(true);
    try {
      const { blob, duration } = await recorder.current!.stop();
      recorder.current = null;
      setRecording(false);
      // Сохраняем сразу, не дожидаясь кнопки: главное — чтобы идея не пропала.
      // Набранные текст и ссылка прикрепляются к записи.
      const idea = await addIdea({ kind: "audio", text, sourceUrl: link, duration }, blob);
      clearDraft();
      toast("Голос сохранён");
      openId.value = idea.id;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить запись");
    } finally {
      setBusy(false);
    }
  }

  async function onVideo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const idea = await addIdea({ kind: "video", text, sourceUrl: link }, file);
      clearDraft();
      toast("Видео сохранено");
      openId.value = idea.id;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить видео");
    } finally {
      setBusy(false);
    }
  }

  async function saveText() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await addIdea({ kind: "text", text, sourceUrl: link });
      clearDraft();
      toast("Заметка сохранена");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить заметку");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="screen record">
      <div class="rec-zone">
        <button
          class={`rec-btn${recording ? " on" : ""}`}
          onClick={toggleRecord}
          disabled={busy}
          aria-label={recording ? "Остановить запись" : "Начать запись голоса"}
        >
          <Icon name={recording ? "stop" : "mic"} size={44} />
        </button>
        <div class="rec-hint">
          {recording ? <span class="rec-time">{formatDuration(elapsed)}</span> : "Нажми и говори"}
        </div>
        <label class={`video-btn${busy || recording ? " disabled" : ""}`}>
          <Icon name="video" size={20} />
          <span>Видео</span>
          <input type="file" accept="video/*" onChange={onVideo} disabled={busy || recording} />
        </label>
      </div>

      <div class="note">
        <textarea
          rows={5}
          placeholder="Или напиши мысль текстом…"
          value={text}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLTextAreaElement).value;
            setText(v);
            saveDraft(DRAFT_TEXT, v);
          }}
        />
        <input
          type="url"
          inputMode="url"
          placeholder="Ссылка на видео (необязательно)"
          value={link}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            setLink(v);
            saveDraft(DRAFT_LINK, v);
          }}
        />
        <button class="primary" onClick={saveText} disabled={!text.trim() || busy || recording}>
          Сохранить заметку
        </button>
      </div>
    </div>
  );
}
