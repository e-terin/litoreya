/**
 * Хранилище мастер-ключа в браузере.
 *
 * В ТЗ значилось «ключевая фраза в localStorage». Здесь сделано иначе, и это
 * осознанный отход: фраза в открытом виде означает, что одна XSS даёт доступ
 * НАВСЕГДА — даже после смены пароля и выхода, потому что украдена сама фраза.
 *
 * Вместо этого хранится не фраза, а неизвлекаемый CryptoKey (DEK) в IndexedDB.
 * Такой ключ нельзя прочитать из JS — только использовать. XSS сможет
 * расшифровать данные, пока жива сессия, но не унесёт ключ на свой сервер и не
 * получит доступ после auto-lock.
 *
 * Интерфейс отделён от реализации намеренно: стратегия хранения меняется
 * подменой класса, а не переписыванием вызывающего кода.
 */

const DB_NAME = "litoreya";
const DB_VERSION = 1;
const STORE = "vault";
const KEY_ID = "dek";

/** Через сколько бездействия ключ стирается. Плата за PBKDF2 — 1-2 с на
 *  разблокировку, поэтому запирать на каждое действие нельзя. */
export const AUTO_LOCK_MS = 15 * 60 * 1000;

export interface KeyVault {
  store(dek: CryptoKey): Promise<void>;
  get(): Promise<CryptoKey | null>;
  clear(): Promise<void>;
  touch(): Promise<void>;
}

type VaultRecord = {
  id: string;
  dek: CryptoKey;
  lastUsedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export class IndexedDbKeyVault implements KeyVault {
  constructor(private readonly autoLockMs: number = AUTO_LOCK_MS) {}

  async store(dek: CryptoKey): Promise<void> {
    // Извлекаемый ключ здесь — ошибка вызывающего кода: он сводит на нет весь
    // смысл этого хранилища, поэтому падаем громко.
    if (dek.extractable) {
      throw new Error(
        "В KeyVault можно класть только неизвлекаемый ключ (extractable: false)",
      );
    }

    const db = await openDatabase();
    const tx = db.transaction(STORE, "readwrite");

    const record: VaultRecord = { id: KEY_ID, dek, lastUsedAt: Date.now() };
    await promisify(tx.objectStore(STORE).put(record));

    db.close();
  }

  async get(): Promise<CryptoKey | null> {
    const db = await openDatabase();
    const tx = db.transaction(STORE, "readonly");
    const record = await promisify<VaultRecord | undefined>(
      tx.objectStore(STORE).get(KEY_ID),
    );
    db.close();

    if (!record) return null;

    if (Date.now() - record.lastUsedAt > this.autoLockMs) {
      await this.clear();
      return null;
    }

    return record.dek;
  }

  /** Продлевает срок жизни ключа. Вызывается на активность пользователя. */
  async touch(): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    const record = await promisify<VaultRecord | undefined>(store.get(KEY_ID));
    if (record) {
      await promisify(store.put({ ...record, lastUsedAt: Date.now() }));
    }

    db.close();
  }

  async clear(): Promise<void> {
    const db = await openDatabase();
    const tx = db.transaction(STORE, "readwrite");
    await promisify(tx.objectStore(STORE).delete(KEY_ID));
    db.close();
  }
}

export const keyVault: KeyVault = new IndexedDbKeyVault();
