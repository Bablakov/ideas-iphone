import { ideas, ready } from "../core/store";
import { HistoryScreen } from "./HistoryScreen";
import { Icon } from "./Icon";
import { IdeaSheet } from "./IdeaSheet";
import { NewCardScreen } from "./NewCardScreen";
import { tab, toastMsg } from "./state";

export function App() {
  const newCount = ideas.value.filter((i) => i.status === "new").length;
  return (
    <div class="app">
      <header class="top">
        <h1>{tab.value === "new" ? "Новая карточка" : "История"}</h1>
        <span class="ver">v{__APP_VERSION__}</span>
      </header>

      {/* Оба экрана всегда в DOM: переключение вкладки не должно обрывать идущую запись. */}
      <main class="main">
        <div class={tab.value === "new" ? "pane" : "pane hidden"}>
          <NewCardScreen />
        </div>
        <div class={tab.value === "history" ? "pane" : "pane hidden"}>
          {ready.value ? <HistoryScreen /> : <div class="empty">Загрузка…</div>}
        </div>
      </main>

      <nav class="tabs">
        <button class={tab.value === "new" ? "on" : ""} onClick={() => (tab.value = "new")}>
          <Icon name="plus" />
          <span>Карточка</span>
        </button>
        <button class={tab.value === "history" ? "on" : ""} onClick={() => (tab.value = "history")}>
          <Icon name="history" />
          <span>История{newCount > 0 ? ` · ${newCount}` : ""}</span>
        </button>
      </nav>

      <IdeaSheet />
      {toastMsg.value && <div class="toast">{toastMsg.value}</div>}
    </div>
  );
}
