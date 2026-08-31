<?php

namespace App\Http\Requests;

use App\Rules\Base64Bytes;

/**
 * Валидация зашифрованного содержимого — единственное, что сервер вправе
 * проверять у постов и категорий.
 *
 * Содержимое для него непрозрачно: ни длину открытого текста, ни его структуру
 * узнать нельзя и не нужно. Проверяются форма base64, размер IV и потолок объёма.
 */
trait EncryptedPayloadRules
{
    /**
     * Потолок шифротекста. Не про безопасность, а про то, чтобы одна запись не
     * съела квоту shared хостинга. ~750 КБ открытого текста после base64.
     */
    public const MAX_CIPHERTEXT_CHARS = 1_000_000;

    /**
     * Максимальная известная версия формата.
     *
     * Запись из будущего клиента приняли бы молча, а расшифровать её потом
     * не смог бы никто — поэтому отвергаем сразу.
     */
    public const MAX_PAYLOAD_VERSION = 1;

    /**
     * @return array<string, mixed>
     */
    protected function encryptedPayloadRules(): array
    {
        return [
            'iv' => ['required', 'string', new Base64Bytes(12)],
            'ciphertext' => ['required', 'string', 'max:'.self::MAX_CIPHERTEXT_CHARS, new Base64Bytes(17, self::MAX_CIPHERTEXT_CHARS)],
            'payload_version' => ['required', 'integer', 'min:1', 'max:'.self::MAX_PAYLOAD_VERSION],
        ];
    }
}
