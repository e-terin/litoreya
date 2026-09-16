<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class UpdatePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Смена пароля требует старого: угнанной сессии одной по себе
            // не должно хватать, чтобы отобрать аккаунт
            'current_password' => ['required', 'string', 'current_password'],

            // Ровно то же правило, что в RegisterRequest: требования к паролю
            // не должны расходиться между регистрацией и сменой
            'password' => ['required', 'confirmed', Password::min(10)],
        ];
    }
}
