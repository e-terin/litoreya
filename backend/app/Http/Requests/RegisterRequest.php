<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class RegisterRequest extends FormRequest
{
    use CryptoEnvelopeRules;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return array_merge(
            [
                'name' => ['required', 'string', 'max:255'],
                'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],

                // Пароль защищает доступ к аккаунту, но НЕ данные — их защищает
                // ключевая фраза, которая сюда никогда не попадает. Поэтому
                // требования разумные, без символьной экзотики.
                'password' => ['required', 'confirmed', Password::min(10)],
            ],
            $this->kdfRules('crypto.'),
            $this->recoveryRules('crypto.'),
            $this->verifierRules('crypto.'),
        );
    }

    /**
     * Крипто-конверт в виде, готовом для записи в users.
     *
     * @return array<string, mixed>
     */
    public function envelope(): array
    {
        return $this->validated()['crypto'];
    }
}
