/** Форматы по убыванию предпочтения: iOS Safari пишет только в mp4/AAC, Chrome/Android — в webm/opus. */
const MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

export function pickAudioMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
}

export interface Recording {
  blob: Blob;
  /** Секунды. */
  duration: number;
}

/** Запись с микрофона. Один экземпляр — одна запись. */
export class AudioRecorder {
  private rec?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private startedAt = 0;

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Запись звука не поддерживается в этом браузере");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickAudioMime();
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    // Кусок раз в секунду: если вкладку убьют посреди записи, потеряется не всё.
    this.rec.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.rec.start(1000);
    this.startedAt = Date.now();
  }

  /** Секунды с начала записи — для таймера на экране. */
  elapsed(): number {
    return this.startedAt ? (Date.now() - this.startedAt) / 1000 : 0;
  }

  stop(): Promise<Recording> {
    const rec = this.rec;
    if (!rec) return Promise.reject(new Error("Запись не начата"));
    return new Promise((resolve) => {
      rec.onstop = () => {
        const duration = this.elapsed();
        const blob = new Blob(this.chunks, { type: rec.mimeType || pickAudioMime() || "audio/mp4" });
        this.release();
        resolve({ blob, duration });
      };
      rec.stop();
    });
  }

  /** Отмена без сохранения. */
  cancel(): void {
    if (this.rec && this.rec.state !== "inactive") {
      this.rec.onstop = null;
      this.rec.stop();
    }
    this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.rec = undefined;
    this.chunks = [];
    this.startedAt = 0;
  }
}
