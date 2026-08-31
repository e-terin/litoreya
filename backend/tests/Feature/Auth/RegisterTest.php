<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Database\Factories\UserFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RegisterTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'name' => 'Иван',
            'email' => 'ivan@example.com',
            'password' => 'correct-horse-battery',
            'password_confirmation' => 'correct-horse-battery',
            'crypto' => UserFactory::fakeEnvelope(),
        ], $overrides);
    }

    public function test_registers_a_user_and_stores_the_crypto_envelope(): void
    {
        $payload = $this->payload();

        $response = $this->postJson('/api/auth/register', $payload);

        $response->assertCreated()
            ->assertJsonPath('user.email', 'ivan@example.com')
            ->assertJsonPath('crypto.wrapped_dek', $payload['crypto']['wrapped_dek']);

        $this->assertDatabaseHas('users', [
            'email' => 'ivan@example.com',
            'kdf_salt' => $payload['crypto']['kdf_salt'],
        ]);

        $this->assertAuthenticated();
    }

    public function test_response_never_exposes_the_password(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload());

        $this->assertStringNotContainsString(
            'correct-horse-battery',
            $response->getContent(),
        );
        $response->assertJsonMissingPath('user.password');
    }

    /**
     * Сервер не может проверить стойкость ключевой фразы, но обязан не принимать
     * ослабленные параметры KDF: при утечке БД именно они определяют стоимость
     * офлайн-перебора.
     */
    public function test_rejects_weakened_kdf_parameters(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload([
            'crypto' => ['kdf_iterations' => 1000],
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.kdf_iterations');
        $this->assertDatabaseCount('users', 0);
    }

    public function test_rejects_unknown_kdf_algorithm(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload([
            'crypto' => ['kdf_algo' => 'MD5'],
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.kdf_algo');
    }

    /**
     * Обрезанная или подменённая обёртка должна отсекаться до записи: развернуть
     * её потом всё равно не выйдет, а пользователь останется без доступа к данным.
     */
    public function test_rejects_wrapped_key_of_wrong_size(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload([
            'crypto' => ['wrapped_dek' => base64_encode(random_bytes(16))],
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.wrapped_dek');
    }

    public function test_rejects_non_base64_crypto_values(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload([
            'crypto' => ['kdf_salt' => 'не base64 совсем'],
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.kdf_salt');
    }

    public function test_requires_the_full_envelope(): void
    {
        $payload = $this->payload();
        unset($payload['crypto']['verifier']);

        $response = $this->postJson('/api/auth/register', $payload);

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.verifier');
    }

    public function test_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'ivan@example.com']);

        $response = $this->postJson('/api/auth/register', $this->payload());

        $response->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_rejects_short_password(): void
    {
        $response = $this->postJson('/api/auth/register', $this->payload([
            'password' => 'korotko',
            'password_confirmation' => 'korotko',
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('password');
    }
}
