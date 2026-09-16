/*
 * Service worker: оболочка приложения работает без сети.
 *
 * Написан руками, без Serwist и подобных. Причины две. Первая: интеграции
 * такого рода цепляются к бандлеру Next, а этот проект уже обжигался на том,
 * что версия Next ведёт себя не так, как ожидалось (см. frontend/AGENTS.md).
 * Вторая: задача узкая — закешировать оболочку и хешированные ассеты, не
 * трогая API, — и укладывается в сотню строк без единой зависимости.
 *
 * ВАЖНО: данные здесь не кешируются. Записи лежат в IndexedDB (lib/offline.ts)
 * в зашифрованном виде, и дублировать их ещё и в Cache API означало бы держать
 * шифротекст в двух местах с разными правилами устаревания.
 *
 * RELEASE подставляется сборкой (bin/build-release.sh). Без этого файл не
 * менялся бы от релиза к релизу, браузер не увидел бы новую версию воркера
 * и пользователь навсегда остался бы на той оболочке, что закешировалась
 * первой.
 */

const RELEASE = "__RELEASE__";
const CACHE = `litoreya-${RELEASE}`;

/*
 * Список хешированных ассетов подставляет сборка, через пробел.
 *
 * Кешировать их «по мере обращения» нельзя: при первом визите чанки
 * скачиваются ДО того, как воркер возьмёт управление, и в кеш не попадают.
 * Офлайн-перезагрузка после такого визита отдаёт разметку без скриптов —
 * пользователь видит вечное «Загрузка…», потому что это пререндеренный HTML,
 * который некому оживить.
 *
 * Строка остаётся валидным JS и без подстановки: фильтр по ведущему слешу
 * отбросит плейсхолдер, и воркер просто не будет ничего предзагружать.
 */
const ASSETS = "__ASSETS__".split(" ").filter((url) => url.startsWith("/"));

/** Оболочка: обе страницы приложения, иконки и ассеты сборки. */
const SHELL = [
  "/",
  "/profile/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  ...ASSETS,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // По одному, а не addAll: тот падает целиком, если не досталась
      // хоть одна ссылка, и тогда не кешируется вообще ничего
      await Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => undefined)),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Кеши прошлых релизов: имя содержит отметку, поэтому чужие видно сразу
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("litoreya-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );

      await self.clients.claim();
    })(),
  );
});

/**
 * Страница просит активировать нового воркера — по кнопке «Обновить».
 *
 * skipWaiting сам по себе не вызывается намеренно: перезагрузка посреди
 * редактирования записи потеряла бы набранное, а черновиков здесь нет.
 */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Чужие origin не трогаем вовсе
  if (url.origin !== self.location.origin) return;

  // API мимо кеша всегда. Ответы содержат шифротекст и состояние сессии;
  // отданный из кеша 200 после разлогина выглядел бы как рабочая сессия
  if (url.pathname.startsWith("/api/")) return;

  // Хешированные ассеты неизменяемы — их можно брать из кеша не спрашивая
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Навигация: сначала сеть, иначе оболочка из кеша.
  //
  // Именно в таком порядке. Обратный (cache-first) отдал бы старую разметку
  // со ссылками на чанки, которых в новом релизе уже нет, — ChunkLoadError
  // у пользователя с открытой вкладкой.
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }

  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response.ok) {
      const cache = await caches.open(CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match("/"));
    if (cached) return cached;

    throw error;
  }
}
