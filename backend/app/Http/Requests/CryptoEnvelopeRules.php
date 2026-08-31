<?php

namespace App\Http\Requests;

use App\Rules\Base64Bytes;
use Illuminate\Validation\Rule;

/**
 * Правила валидации крипто-конверта, общие для регистрации и смены ключевой фразы.
 */
trait CryptoEnvelopeRules
{
    /**
     * Нижняя граница числа итераций KDF.
     *
     * Сервер не может проверить стойкость ключевой фразы, но обязан не принимать
     * ослабленные параметры вывода ключа: при утечке БД именно они определяют
     * стоимость офлайн-перебора. Соответствует рекомендации OWASP для PBKDF2-SHA256.
     */
    public const MIN_KDF_ITERATIONS = 600_000;

    /** Алгоритмы, которые клиент вправе объявить. Argon2id добавляется явно. */
    public const ALLOWED_KDF_ALGOS = ['PBKDF2-SHA256'];

    /**
     * @return array<string, mixed>
     */
    protected function kdfRules(string $prefix = ''): array
    {
        return [
            $prefix.'kdf_algo' => ['required', 'string', Rule::in(self::ALLOWED_KDF_ALGOS)],
            $prefix.'kdf_iterations' => ['required', 'integer', 'min:'.self::MIN_KDF_ITERATIONS, 'max:10000000'],
            $prefix.'kdf_salt' => ['required', 'string', new Base64Bytes(16)],
            // 32 байта ключа + 16 байт тега аутентичности AES-GCM
            $prefix.'wrapped_dek' => ['required', 'string', new Base64Bytes(48)],
            $prefix.'wrapped_dek_iv' => ['required', 'string', new Base64Bytes(12)],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    protected function recoveryRules(string $prefix = ''): array
    {
        return [
            $prefix.'recovery_salt' => ['required', 'string', new Base64Bytes(16)],
            $prefix.'recovery_dek' => ['required', 'string', new Base64Bytes(48)],
            $prefix.'recovery_dek_iv' => ['required', 'string', new Base64Bytes(12)],
        ];
    }

    /**
     * Verifier — шифротекст короткой константы. Точная длина зависит от неё,
     * поэтому проверяем диапазон, а не значение: сервер не знает открытый текст.
     *
     * @return array<string, mixed>
     */
    protected function verifierRules(string $prefix = ''): array
    {
        return [
            $prefix.'verifier' => ['required', 'string', new Base64Bytes(17, 80)],
            $prefix.'verifier_iv' => ['required', 'string', new Base64Bytes(12)],
        ];
    }
}
