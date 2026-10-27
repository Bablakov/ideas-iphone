import { useEffect, useRef, useState } from "preact/hooks";
import { dayKey, dayLabel, formatTime } from "../core/format";
import { checkAccess } from "../core/github";
import { config, repoRef, saveConfig, type SyncConfig } from "../core/settings";
import { ideas } from "../core/store";
import { syncNow, syncState } from "../core/sync";
import type { SyncMode } from "../core/manifest";
import { toast } from "./state";

function lastSyncText(ts: number): string {
  return ts ? `${dayLabel(dayKey(ts))}, ${formatTime(ts)}` : "ещё не было";
}

export function SettingsScreen() {
  const c = config.value;
  const s = syncState.value;
  const [checking, setChecking] = useState(false);
  const [access, setAccess] = useState<{ ok: boolean; message: string }>();
  const [showToken, setShowToken] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [armed, setArmed] = useState<Exclude<SyncMode, "merge"> | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(armTimer.current), []);

  const pending = ideas.value.filter((i) => !i.synced).length;
  const configured = repoRef(c) !== undefined;

  const update = (patch: Partial<SyncConfig>) => {
    setAccess(undefined);
    saveConfig({ ...c, ...patch });
  };

  async function check() {
    const ref = repoRef(c);
    if (!ref) {
      setAccess({ ok: false, message: "Заполни репозиторий в виде владелец/репозиторий и вставь токен" });
      return;
    }
    setChecking(true);
    setAccess(await checkAccess(ref));
    setChecking(false);
  }

  /** Опасные режимы с подтверждением вторым нажатием: первое «взводит» кнопку на 4 секунды. */
  async function force(mode: Exclude<SyncMode, "merge">) {
    if (armed !== mode) {
      setArmed(mode);
      clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(null), 4000);
      return;
    }
    clearTimeout(armTimer.current);
    setArmed(null);
    await syncNow(mode);
    const r = syncState.value;
    toast(r.error || r.message);
  }

  function wipeToken() {
    if (!confirmWipe) {
      setConfirmWipe(true);
      setTimeout(() => setConfirmWipe(false), 3000);
      return;
    }
    setConfirmWipe(false);
    saveConfig({ ...c, token: "" });
    setAccess(undefined);
    toast("Токен стёрт с этого устройства");
  }

  return (
    <div class="screen">
      <section class="block">
        <h2>Синхронизация через GitHub</h2>
        <label class="field">
          Репозиторий с данными
          <input
            value={c.repo}
            placeholder="владелец/репозиторий"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            onInput={(e) => update({ repo: (e.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          Ветка
          <input
            value={c.branch}
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            onInput={(e) => update({ branch: (e.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          Personal Access Token
          <input
            type={(showToken ? "text" : "password") as "text"}
            value={c.token}
            placeholder="github_pat_…"
            autocapitalize="off"
            autocorrect="off"
            spellcheck={false}
            onInput={(e) => update({ token: (e.currentTarget as HTMLInputElement).value })}
          />
        </label>
        <label class="check">
          <input type="checkbox" checked={showToken} onChange={(e) => setShowToken((e.currentTarget as HTMLInputElement).checked)} />
          <span>Показать токен</span>
        </label>

        <div class="save-bar">
          <button class="secondary" onClick={check} disabled={checking}>
            {checking ? "Проверяю…" : "Проверить доступ"}
          </button>
          <button class="primary" onClick={() => void syncNow()} disabled={!configured || s.running}>
            {s.running ? "Синхронизация…" : "Синхронизировать сейчас"}
          </button>
        </div>

        {access && <div class={`notice ${access.ok ? "ok" : "bad"}`}>{access.message}</div>}
        {s.error && <div class="notice bad">{s.error}</div>}
      </section>

      <section class="block">
        <h2>Если версии разошлись</h2>
        <div class="hint-small left">
          Обычная синхронизация сама берёт более свежую правку каждой карточки. Если нужно решить вручную, кто
          главный:
        </div>
        <button class={`secondary${armed === "remote" ? " armed-warn" : ""}`} onClick={() => void force("remote")} disabled={!configured || s.running}>
          {armed === "remote" ? "Точно? Мои правки заменятся" : "Взять версию с GitHub"}
        </button>
        <div class="hint-small left">Твои правки существующих карточек на этом устройстве заменятся версиями из репозитория. Карточки, которых там нет, останутся и уйдут туда.</div>
        <button class={`secondary${armed === "local" ? " armed-warn" : ""}`} onClick={() => void force("local")} disabled={!configured || s.running}>
          {armed === "local" ? "Точно? Версии на GitHub заменятся" : "Отправить мою версию на GitHub"}
        </button>
        <div class="hint-small left">Версии карточек в репозитории заменятся тем, что на этом устройстве. Карточки, которых нет на устройстве, на GitHub не тронутся.</div>
      </section>

      <section class="block">
        <h2>Состояние</h2>
        <div class="stat">
          <span>Последняя синхронизация</span>
          <b>{lastSyncText(s.last)}</b>
        </div>
        <div class="stat">
          <span>Ждут отправки</span>
          <b>{configured ? pending : "—"}</b>
        </div>
        {s.running && s.message && <div class="hint-small left">{s.message}</div>}
        {!s.running && s.message && !s.error && <div class="hint-small left">{s.message}</div>}
        <div class="hint-small left">
          Приложение синхронизируется само: при открытии, при появлении сети и через пару секунд после правки. В
          фоне, пока оно закрыто, iPhone этого не позволяет.
        </div>
      </section>

      <section class="block">
        <h2>Как получить токен</h2>
        <ol class="steps">
          <li>github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens.</li>
          <li>Generate new token. Repository access: Only select repositories → только репозиторий с данными.</li>
          <li>Repository permissions → Contents: Read and write. Остальное не включай.</li>
          <li>Скопируй токен (он показывается один раз) и вставь сюда. Токен хранится только на этом устройстве.</li>
        </ol>
        <button class={`danger${confirmWipe ? " armed" : ""}`} onClick={wipeToken} disabled={!c.token}>
          {confirmWipe ? "Точно стереть токен?" : "Стереть токен с устройства"}
        </button>
      </section>
    </div>
  );
}
