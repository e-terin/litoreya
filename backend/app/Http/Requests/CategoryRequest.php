<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CategoryRequest extends FormRequest
{
    use EncryptedPayloadRules;

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
            ...$this->encryptedPayloadRules(),
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }
}
