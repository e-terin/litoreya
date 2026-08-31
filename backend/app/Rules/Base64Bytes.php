<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Значение — корректный base64, разворачивающийся в заданное число байт.
 *
 * Это вся валидация, которую сервер вправе применять к крипто-полям: содержимое
 * для него непрозрачно, проверить можно только форму и размер. Точные размеры
 * важны — они отсекают обрезанные и подменённые обёртки до записи в БД.
 */
class Base64Bytes implements ValidationRule
{
    /**
     * @param  int  $min  минимальная длина в байтах после декодирования
     * @param  int|null  $max  максимальная; null — точное совпадение с $min
     */
    public function __construct(
        private readonly int $min,
        private readonly ?int $max = null,
    ) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_string($value)) {
            $fail('Поле :attribute должно быть строкой base64.');

            return;
        }

        // strict: отвергает символы вне алфавита base64
        $decoded = base64_decode($value, true);

        if ($decoded === false) {
            $fail('Поле :attribute не является корректным base64.');

            return;
        }

        $length = strlen($decoded);
        $max = $this->max ?? $this->min;

        if ($length < $this->min || $length > $max) {
            $fail($max === $this->min
                ? "Поле :attribute должно содержать ровно {$this->min} байт."
                : "Поле :attribute должно содержать от {$this->min} до {$max} байт.");
        }
    }
}
