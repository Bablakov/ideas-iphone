/**
 * new — лежит необработанной, processed — разобрана (конспект, карточка и т.п.),
 * archived — убрана с глаз, но не удалена: её можно вернуть.
 */
export type IdeaStatus = "new" | "processed" | "archived";

export type MediaKind = "audio" | "video";

/** Описание прикреплённого файла; сам Blob лежит отдельно в сторе `media`. */
export interface MediaInfo {
  mime: string;
  size: number;
  /** Секунды, 0 — неизвестна. */
  duration: number;
}

/**
 * Карточка-идея: в ней может быть и аудио, и видео, и текст, и ссылка — всё необязательно,
 * но что-то одно должно быть. Метаданные лежат в сторе `ideas`, файлы — в `media`
 * под ключами `<id>:audio` и `<id>:video`, чтобы список читался быстро.
 */
export interface Idea {
  id: string;
  /** Время создания, мс с эпохи. */
  created: number;
  /** Время последней правки, мс. По нему при синхронизации побеждает более свежая версия. */
  updated: number;
  text: string;
  /** Ссылка на видео/источник, если идея про конкретный ролик. */
  sourceUrl: string;
  status: IdeaStatus;
  audio?: MediaInfo;
  video?: MediaInfo;
  /** true, если в репозитории лежит ровно эта версия карточки. */
  synced: boolean;
  /** Sha файла item.json в репозитории, каким мы видели его в последний раз. */
  remoteSha?: string;
  /**
   * Надгробие: карточка удалена, но ещё не отправлена в репозиторий. Без него другое устройство
   * вернуло бы её обратно. После отправки запись стирается совсем. В интерфейсе не показывается.
   */
  deleted?: boolean;
}

export interface NewIdea {
  text: string;
  sourceUrl: string;
  audio?: { blob: Blob; duration: number };
  video?: { blob: Blob; duration?: number };
}
