<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Смена ключевой фразы: приходит только новая обёртка мастер-ключа.
 *
 * Verifier и recovery-обёртка не меняются — они привязаны к DEK, а DEK при смене
 * фразы остаётся прежним. В этом весь смысл схемы: посты не перешифровываются
 * (docs/crypto-design.md §3).
 */
class UpdateKeyphraseRequest extends FormRequest
{
    use CryptoEnvelopeRules;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return array_merge(
            // Перевыпуск обёртки требует подтверждения паролем: угнанной сессии
            // одной по себе не должно хватать
            ['current_password' => ['required', 'string', 'current_password']],
            $this->kdfRules('crypto.'),
        );
    }
}
