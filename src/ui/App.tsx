import { ideas, ready } from "../core/store";
import { syncState } from "../core/sync";
import { ArchiveScreen } from "./ArchiveScreen";
import { HistoryScreen } from "./HistoryScreen";
import { Icon, type IconName } from "./Icon";
import { IdeaSheet } from "./IdeaSheet";
import { NewCardScreen } from "./NewCardScreen";
import { SettingsScreen } from "./SettingsScreen";
import { tab, toastMsg, type Tab } from "./state";

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

export function App() {
  const newCount = ideas.value.filter((i) => i.status === "new").length;
  const syncing = syncState.value.running;
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
      </nav>

      <IdeaSheet />
      {toastMsg.value && <div class="toast">{toastMsg.value}</div>}
    </div>
  );
}
