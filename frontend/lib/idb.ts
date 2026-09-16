/**
 * Одно соединение с IndexedDB на всё приложение.
 *
 * База у нас одна, а хранилищ в ней несколько: мастер-ключ и офлайн-кеш
 * записей. Открывать её из разных модулей с разными номерами версий нельзя —
 * тот, кто откроет вторым с меньшей версией, получит VersionError, а с
 * большей — заблокирует первого. Поэтому номер версии и создание хранилищ
 * живут здесь, в одном месте.
 */

const DB_NAME = "litoreya";

/** Версия 1 — только vault. Версия 2 добавила офлайн-кеш. */
const DB_VERSION = 2;

export const STORE_VAULT = "vault";
export const STORE_RECORDS = "records";
export const STORE_META = "meta";

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      // Проверка на существование обязательна: апгрейд с версии 1 придёт
      // в базу, где vault уже есть
      if (!db.objectStoreNames.contains(STORE_VAULT)) {
        db.createObjectStore(STORE_VAULT, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    // Апгрейд версии не начнётся, пока базу держит открытой другая вкладка.
    // Без этого обработчика промис не разрешится никогда, и приложение
    // застынет на экране загрузки, ничего не сообщив.
    request.onblocked = () =>
      reject(
        new Error(
          "База занята другой вкладкой Litoreya. Закройте её и обновите страницу.",
        ),
      );
  });
}

export function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Транзакция целиком: put в цикле возвращает управление до записи на диск. */
export function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
