<?php

namespace Database\Factories;

use App\Models\Post;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Post>
 */
class PostFactory extends Factory
{
    /**
     * Содержимое — просто случайные байты: сервер и в бою не отличает
     * настоящий шифротекст от любого другого блоба нужного размера.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'category_id' => null,
            'type' => fake()->randomElement(Post::TYPES),
            'iv' => base64_encode(random_bytes(12)),
            'ciphertext' => base64_encode(random_bytes(fake()->numberBetween(64, 512))),
            'payload_version' => 1,
        ];
    }
}
