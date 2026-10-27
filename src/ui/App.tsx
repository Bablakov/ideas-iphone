import { ideas, ready } from "../core/store";
import { syncNow, syncState } from "../core/sync";
import { ArchiveScreen } from "./ArchiveScreen";
import { HistoryScreen } from "./HistoryScreen";
import { Icon, type IconName } from "./Icon";
import { IdeaSheet } from "./IdeaSheet";
import { NewCardScreen } from "./NewCardScreen";
import { SettingsScreen } from "./SettingsScreen";
import { repoRef } from "../core/settings";
import { tab, toast, toastMsg, type Tab } from "./state";

const TITLES: Record<Tab, string> = {
  new: "Новая карточка",
  history: "История",
  archive: "Архив",
  settings: "Настройки",
};

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: "new", icon: "plus", label: "Карточка" },
  { id: "history", icon: "history", label: "История" },
  { id: "archive", icon: "archive", label: "Архив" },
  { id: "settings", icon: "settings", label: "Настройки" },
];

function Pane({ id, children }: { id: Tab; children: preact.ComponentChildren }) {
  return <div class={tab.value === id ? "pane" : "pane hidden"}>{children}</div>;
}

/** Быстрая синхронизация одной кнопкой из любой вкладки. */
async function quickSync(): Promise<void> {
  if (syncState.value.running) return;
  if (!repoRef()) {
    tab.value = "settings";
    toast("Сначала впиши токен GitHub");
    return;
  }
  if (navigator.onLine === false) {
    toast("Нет сети — синхронизирую, когда появится");
    return;
  }
  await syncNow();
  const s = syncState.value;
  toast(s.error || s.message);
}

export function App() {
  const newCount = ideas.value.filter((i) => i.status === "new").length;
  const syncing = syncState.value.running;
  const pending = ideas.value.filter((i) => !i.synced).length;
  const syncFailed = syncState.value.error !== "";
  return (
    <div class="app">
      <header class="top">
        <h1>{TITLES[tab.value]}</h1>
        <span class="ver">{syncing ? "синхронизация…" : `v${__APP_VERSION__}`}</span>
      </header>

      {/* Все экраны всегда в DOM: переключение вкладки не должно обрывать идущую запись. */}
      <main class="main">
        <Pane id="new">
          <NewCardScreen />
        </Pane>
        <Pane id="history">{ready.value ? <HistoryScreen /> : <div class="empty">Загрузка…</div>}</Pane>
        <Pane id="archive">{ready.value ? <ArchiveScreen /> : <div class="empty">Загрузка…</div>}</Pane>
        <Pane id="settings">
          <SettingsScreen />
        </Pane>
      </main>

      <nav class="tabs">
        {TABS.map((t) => (
          <button class={tab.value === t.id ? "on" : ""} onClick={() => (tab.value = t.id)}>
            <Icon name={t.icon} />
            <span>{t.id === "history" && newCount > 0 ? `${t.label} · ${newCount}` : t.label}</span>
          </button>
        ))}
        <button
          class={`sync-btn${syncing ? " spin" : ""}${syncFailed ? " failed" : ""}`}
          onClick={() => void quickSync()}
          aria-label="Синхронизировать"
        >
          <span class="sync-icon">
            <Icon name="sync" />
            {pending > 0 && !syncing && <i class="dot" />}
          </span>
          <span>{syncing ? "Идёт…" : "Синхрон."}</span>
        </button>
      </nav>

      <IdeaSheet />
      {toastMsg.value && <div class="toast">{toastMsg.value}</div>}
    </div>
  );
}
