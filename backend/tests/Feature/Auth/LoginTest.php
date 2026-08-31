<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_logs_in_and_returns_the_crypto_envelope(): void
    {
        $user = User::factory()->create(['email' => 'ivan@example.com']);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'ivan@example.com',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('crypto.wrapped_dek', $user->wrapped_dek)
            ->assertJsonPath('crypto.kdf_iterations', $user->kdf_iterations);

        $this->assertAuthenticatedAs($user);
    }

    public function test_rejects_wrong_password(): void
    {
        User::factory()->create(['email' => 'ivan@example.com']);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'ivan@example.com',
            'password' => 'not-the-password',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('email');
        $this->assertGuest();
    }

    /**
     * Неверный пароль и несуществующий аккаунт должны быть неразличимы, иначе
     * форма входа превращается в способ проверять наличие email в базе.
     */
    public function test_does_not_reveal_whether_the_account_exists(): void
    {
        User::factory()->create(['email' => 'ivan@example.com']);

        $existing = $this->postJson('/api/auth/login', [
            'email' => 'ivan@example.com',
            'password' => 'wrong',
        ]);

        $missing = $this->postJson('/api/auth/login', [
            'email' => 'nobody@example.com',
            'password' => 'wrong',
        ]);

        $this->assertSame($existing->status(), $missing->status());
        $this->assertSame(
            $existing->json('errors.email'),
            $missing->json('errors.email'),
        );
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_me_returns_the_envelope_for_an_authenticated_user(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/auth/me');

        $response->assertOk()
            ->assertJsonPath('user.id', $user->id)
            ->assertJsonPath('crypto.verifier', $user->verifier);
    }

    /**
     * Крипто-поля отдаются только явным блоком crypto. В самом объекте
     * пользователя их быть не должно, чтобы они не растекались по ответам API.
     */
    public function test_crypto_fields_are_not_part_of_the_user_object(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/auth/me');

        foreach (User::CRYPTO_FIELDS as $field) {
            $response->assertJsonMissingPath("user.{$field}");
        }
    }

    public function test_logs_out(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/auth/logout')->assertOk();

        // Проверяем именно web-guard: middleware auth:sanctum делает guard
        // 'sanctum' дефолтным, а RequestGuard кеширует пользователя на время
        // запроса. Без явного указания assertGuest() читал бы этот кеш, а не
        // состояние сессии, — в браузере следующий запрос обрабатывается заново.
        $this->assertGuest('web');
    }

    public function test_throttles_repeated_failed_logins(): void
    {
        User::factory()->create(['email' => 'ivan@example.com']);

        $attempt = fn () => $this->postJson('/api/auth/login', [
            'email' => 'ivan@example.com',
            'password' => 'wrong',
        ]);

        for ($i = 0; $i < 5; $i++) {
            $attempt()->assertStatus(422);
        }

        $attempt()->assertStatus(429);
    }
}
