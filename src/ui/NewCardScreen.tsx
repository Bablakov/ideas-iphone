import { useEffect, useRef, useState } from "preact/hooks";
import {
  clearDraftMedia, discardDraft, draft, isDraftEmpty, patchDraft, saveDraftAsIdea, setDraftAudio, setDraftVideo,
} from "../core/draft";
import { formatDuration, formatSize } from "../core/format";
import { AudioRecorder } from "../core/recorder";
import { BlobMedia } from "./BlobMedia";
import { Icon } from "./Icon";
import { tab, toast } from "./state";

function micError(e: unknown): string {
  if (e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
    return "Нет доступа к микрофону — разреши его в настройках";
  }
  return e instanceof Error ? e.message : "Не удалось начать запись";
}

export function NewCardScreen() {
  const d = draft.value;
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const recorder = useRef<AudioRecorder | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(recorder.current?.elapsed() ?? 0), 250);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => clearTimeout(clearTimer.current), []);

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
      await setDraftAudio(blob, duration);
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
      await setDraftVideo(file);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось добавить видео");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (busy || recording || isDraftEmpty(d)) return;
    setBusy(true);
    try {
      await saveDraftAsIdea();
      toast("Карточка сохранена");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Не удалось сохранить карточку");
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      clearTimer.current = setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    recorder.current?.cancel();
    recorder.current = null;
    setRecording(false);
    await discardDraft();
  }

  const empty = isDraftEmpty(d);

  return (
    <div class="screen">
      {/* Аудио */}
      <section class="block">
        <h2>Аудио</h2>
        {d.audio ? (
          <div class="attached">
            <BlobMedia blob={d.audio.blob} kind="audio" />
            <div class="attached-bar">
              <span>
                {formatDuration(d.audio.duration)} · {formatSize(d.audio.blob.size)}
              </span>
              <button class="icon-btn" onClick={() => clearDraftMedia("audio")} aria-label="Убрать аудио" disabled={busy}>
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>
        ) : (
          <div class="rec-row">
            <button
              class={`rec-btn${recording ? " on" : ""}`}
              onClick={toggleRecord}
              disabled={busy}
              aria-label={recording ? "Остановить запись" : "Начать запись голоса"}
            >
              <Icon name={recording ? "stop" : "mic"} size={34} />
            </button>
            <div class="rec-hint">
              {recording ? <span class="rec-time">{formatDuration(elapsed)}</span> : "Нажми и говори"}
            </div>
          </div>
        )}
      </section>

      {/* Видео */}
      <section class="block">
        <h2>Видео</h2>
        {d.video ? (
          <div class="attached">
            <BlobMedia blob={d.video.blob} kind="video" />
            <div class="attached-bar">
              <span>{formatSize(d.video.blob.size)}</span>
              <button class="icon-btn" onClick={() => clearDraftMedia("video")} aria-label="Убрать видео" disabled={busy}>
                <Icon name="close" size={20} />
              </button>
            </div>
          </div>
        ) : (
          <label class={`pick-btn${busy || recording ? " disabled" : ""}`}>
            <Icon name="video" size={20} />
            <span>Снять или выбрать видео</span>
            <input type="file" accept="video/*" onChange={onVideo} disabled={busy || recording} />
          </label>
        )}
      </section>

      {/* Текст и ссылка */}
      <section class="block">
        <h2>Текст</h2>
        <textarea
          rows={5}
          placeholder="Мысль, идея, заметка…"
          value={d.text}
          onInput={(e) => patchDraft({ text: (e.currentTarget as HTMLTextAreaElement).value })}
        />
        <label class="check">
          <input
            type="checkbox"
            checked={d.linkOn}
            onChange={(e) => patchDraft({ linkOn: (e.currentTarget as HTMLInputElement).checked })}
          />
          <span>Ссылка на видео</span>
        </label>
        {d.linkOn && (
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={d.sourceUrl}
            onInput={(e) => patchDraft({ sourceUrl: (e.currentTarget as HTMLInputElement).value })}
          />
        )}
      </section>

      <div class="save-bar">
        <button class="primary" onClick={save} disabled={empty || busy || recording}>
          Сохранить карточку
        </button>
        {(!empty || recording) && (
          <button class={`danger${confirmClear ? " armed" : ""}`} onClick={clearAll} disabled={busy}>
            {confirmClear ? "Точно очистить?" : "Очистить"}
          </button>
        )}
      </div>
      {!empty && (
        <div class="hint-small">
          Черновик хранится на телефоне, пока ты не нажал «Сохранить» — запись не пропадёт, даже если закрыть
          приложение.
        </div>
      )}
      <button class="link center" onClick={() => (tab.value = "history")}>
        Перейти в историю
      </button>
    </div>
  );
}
