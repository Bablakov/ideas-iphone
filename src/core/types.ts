export type IdeaKind = "audio" | "text" | "video";

/** new — лежит необработанной, processed — разобрана (конспект, карточка и т.п.). */
export type IdeaStatus = "new" | "processed";

/**
 * Запись-идея. Метаданные лежат в сторе `ideas`, сам файл (аудио/видео) — отдельно в сторе `media`
 * под тем же id, чтобы список читался быстро и не тянул гигабайты в память.
 */
export interface Idea {
  id: string;
  /** Время создания, мс с эпохи. */
  created: number;
  kind: IdeaKind;
  text: string;
  /** Ссылка на видео/источник, если идея про конкретный ролик. */
  sourceUrl: string;
  status: IdeaStatus;
  mediaMime: string;
  mediaSize: number;
  /** Длительность в секундах, 0 — неизвестна. */
  duration: number;
  /** Зарезервировано под синхронизацию с ПК: ушла ли запись в хранилище. */
  synced: boolean;
}

export type NewIdea = Pick<Idea, "kind" | "text" | "sourceUrl"> & Partial<Pick<Idea, "duration">>;
