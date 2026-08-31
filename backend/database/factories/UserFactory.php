<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    /**
     * The current password being used by the factory.
     */
    protected static ?string $password;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'email_verified_at' => now(),
            'password' => static::$password ??= Hash::make('password'),
            'remember_token' => Str::random(10),
            ...self::fakeEnvelope(),
        ];
    }

    /**
     * Правдоподобный по форме крипто-конверт: случайные байты нужной длины.
     *
     * Развернуть его нельзя — настоящие обёртки собирает только клиент. Для
     * серверных тестов этого достаточно: сервер и в бою обращается с этими
     * полями как с непрозрачными строками.
     *
     * @return array<string, mixed>
     */
    public static function fakeEnvelope(): array
    {
        $bytes = fn (int $n) => base64_encode(random_bytes($n));

        return [
            'kdf_algo' => 'PBKDF2-SHA256',
            'kdf_iterations' => 600_000,
            'kdf_salt' => $bytes(16),
            'wrapped_dek' => $bytes(48),
            'wrapped_dek_iv' => $bytes(12),
            'recovery_salt' => $bytes(16),
            'recovery_dek' => $bytes(48),
            'recovery_dek_iv' => $bytes(12),
            'verifier' => $bytes(27),
            'verifier_iv' => $bytes(12),
        ];
    }

    /**
     * Indicate that the model's email address should be unverified.
     */
    public function unverified(): static
    {
        return $this->state(fn (array $attributes) => [
            'email_verified_at' => null,
        ]);
    }
}
