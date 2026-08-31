<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'iv' => base64_encode(random_bytes(12)),
            'ciphertext' => base64_encode(random_bytes(48)),
            'payload_version' => 1,
            'position' => 0,
        ];
    }
}
