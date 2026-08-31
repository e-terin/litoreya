import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // node, а не jsdom: WebCrypto в Node 20 доступен как globalThis.crypto и
    // ведёт себя как браузерный. IndexedDB подменяется fake-indexeddb точечно.
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // PBKDF2 на 600k итераций — секунды, а не миллисекунды. Это цена стойкости
    // к офлайн-перебору, снижать её ради скорости тестов нельзя: тогда тесты
    // проверяли бы не ту схему, что работает в бою.
    testTimeout: 30_000,
  },
});
