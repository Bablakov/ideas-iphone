import { render } from "preact";
import { registerSW } from "virtual:pwa-register";
import { flushDraft, loadDraft } from "./core/draft";
import { initStore, ready } from "./core/store";
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
}

void boot();

// Когда приложение уходит в фон, дописываем черновик сразу — iOS может выгрузить его без предупреждения.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushDraft();
});
window.addEventListener("pagehide", flushDraft);

// Новая версия ставится в фоне и подхватывается при следующем открытии.
registerSW({ immediate: true });
