import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDbKeyVault } from "./keyvault";

/*
 * KeyVault хранит неизвлекаемый CryptoKey, а не ключевую фразу. Тесты фиксируют
 * оба свойства, ради которых это сделано: ключ нельзя экспортировать, и он
 * исчезает сам по бездействию.
 */

async function makeDek(extractable = false): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

describe("IndexedDbKeyVault", () => {
  let vault: IndexedDbKeyVault;

  beforeEach(async () => {
    vault = new IndexedDbKeyVault();
    await vault.clear();
  });

  it("сохраняет и возвращает ключ", async () => {
    const dek = await makeDek();
    await vault.store(dek);

    const restored = await vault.get();

    expect(restored).not.toBeNull();
    expect(restored!.algorithm).toEqual(dek.algorithm);
  });

  it("сохранённый ключ остаётся неизвлекаемым", async () => {
    await vault.store(await makeDek());
    const restored = await vault.get();

    expect(restored!.extractable).toBe(false);
    // Именно это делает хранение безопасным: XSS не сможет унести ключ наружу
    await expect(crypto.subtle.exportKey("raw", restored!)).rejects.toThrow();
  });

  /**
   * Извлекаемый ключ сводит на нет весь смысл хранилища, поэтому это ошибка
   * вызывающего кода, а не тихо принятое значение.
   */
  it("отказывается принимать извлекаемый ключ", async () => {
    await expect(vault.store(await makeDek(true))).rejects.toThrow(
      /неизвлекаемый/,
    );
  });

  it("возвращает null, когда ключа нет", async () => {
    await expect(vault.get()).resolves.toBeNull();
  });

  it("стирает ключ по clear()", async () => {
    await vault.store(await makeDek());
    await vault.clear();

    await expect(vault.get()).resolves.toBeNull();
  });

  it("сам забывает ключ после бездействия", async () => {
    const shortLived = new IndexedDbKeyVault(-1); // срок истёк сразу
    await shortLived.store(await makeDek());

    await expect(shortLived.get()).resolves.toBeNull();
  });

  it("продлевает срок жизни при активности", async () => {
    const vaultWithWindow = new IndexedDbKeyVault(50);
    await vaultWithWindow.store(await makeDek());

    await new Promise((r) => setTimeout(r, 30));
    await vaultWithWindow.touch();
    await new Promise((r) => setTimeout(r, 30));

    // Без touch() ключ уже был бы стёрт
    await expect(vaultWithWindow.get()).resolves.not.toBeNull();
  });

  it("ключ из хранилища пригоден для расшифровки", async () => {
    const dek = await makeDek();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      dek,
      new TextEncoder().encode("проверка"),
    );

    await vault.store(dek);
    const restored = await vault.get();

    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      restored!,
      ciphertext,
    );

    expect(new TextDecoder().decode(plaintext)).toBe("проверка");
  });
});
