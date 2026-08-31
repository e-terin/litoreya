<?php

namespace App\Http\Requests;

use App\Models\Post;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PostRequest extends FormRequest
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

            'type' => ['required', Rule::in(Post::TYPES)],

            // Категория обязана принадлежать тому же пользователю: иначе по
            // чужому id можно было бы выяснить, существует ли он
            'category_id' => [
                'nullable',
                Rule::exists('categories', 'id')->where('user_id', $this->user()->id),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'category_id.exists' => 'Категория не найдена.',
        ];
    }
}
