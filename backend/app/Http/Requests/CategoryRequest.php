<?php

namespace App\Http\Requests;

use App\Rules\CategoryParent;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

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
        $categoryId = $this->route('category');

        return [
            ...$this->encryptedPayloadRules(),
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],

            // Родитель обязан принадлежать тому же пользователю — иначе по
            // чужому id можно было бы выяснить, существует ли он. Остальное
            // (цикл, глубина) видно только на дереве целиком.
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('categories', 'id')->where('user_id', $this->user()->id),
                new CategoryParent(
                    $this->user()->id,
                    $categoryId === null ? null : (int) $categoryId,
                ),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'parent_id.exists' => 'Родительская категория не найдена.',
        ];
    }
}
