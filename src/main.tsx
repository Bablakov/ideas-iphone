import { effect } from "@preact/signals";
import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { flushDraft, loadDraft } from "./core/draft";
import { changed, initStore, ready } from "./core/store";
import { scheduleSync, syncNow } from "./core/sync";
import "./styles.css";
import { App } from "./ui/App";

render(<App />, document.getElementById("app")!);

async function boot(): Promise<void> {
  try {
    // Просим браузер не вычищать данные (записи и аудио) при нехватке места.
    void navigator.storage?.persist?.().catch(() => {});
    await Promise.all([initStore(), loadDraft()]);
  } catch (e) {
    // Без IndexedDB (например, приватный режим старого Safari) приложение всё равно открывается — пустым.
    console.error("boot failed", e);
    ready.value = true;
  }
  void syncNow();
}

void boot();

// Любая правка пользователя → синхронизация через пару секунд (серия правок склеивается в одну).
let firstRun = true;
effect(() => {
  void changed.value;
  if (firstRun) firstRun = false;
  else scheduleSync();
});

// Когда приложение уходит в фон, дописываем черновик сразу — iOS может выгрузить его без предупреждения.
// Когда возвращается на экран или появляется сеть — подтягиваем и отправляем изменения.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraft();
  else scheduleSync(500);
});
window.addEventListener("pagehide", flushDraft);
window.addEventListener("online", () => scheduleSync(500));

// Новая версия ставится в фоне и подхватывается при следующем открытии.
registerSW({ immediate: true });
