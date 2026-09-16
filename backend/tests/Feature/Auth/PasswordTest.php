<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PasswordTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'current_password' => 'password',
            'password' => 'new-long-password',
            'password_confirmation' => 'new-long-password',
            ...$overrides,
        ];
    }

    public function test_changes_the_password(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload())
            ->assertOk();

        $this->assertTrue(
            password_verify('new-long-password', $user->fresh()->password),
        );
    }

    public function test_new_password_works_and_old_one_stops(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload())
            ->assertOk();

        // Guard указан явно. Дефолтным после auth:sanctum становится guard
        // sanctum — RequestGuard, который учётные данные не проверяет вовсе.
        $this->assertTrue(Auth::guard('web')->validate([
            'email' => $user->email,
            'password' => 'new-long-password',
        ]));

        $this->assertFalse(Auth::guard('web')->validate([
            'email' => $user->email,
            'password' => 'password',
        ]));
    }

    public function test_requires_the_current_password(): void
    {
        $user = User::factory()->create();
        $before = $user->password;

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload([
                'current_password' => 'wrong-password',
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertSame($before, $user->fresh()->password);
    }

    public function test_rejects_a_short_password(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload([
                'password' => 'short',
                'password_confirmation' => 'short',
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_rejects_a_mismatched_confirmation(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload([
                'password_confirmation' => 'something-else',
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_requires_authentication(): void
    {
        $this->putJson('/api/auth/password', $this->payload())
            ->assertUnauthorized();
    }

    /**
     * Смысл смены пароля при утечке — выгнать того, кто уже вошёл. Поэтому
     * чужие сессии обязаны исчезнуть сразу, а не когда их владелец очнётся.
     */
    public function test_ends_other_sessions_but_keeps_the_current_one(): void
    {
        // В phpunit.xml драйвер сессий — array, а поведение осмысленно только
        // при database, который задан в обеих реальных средах
        config(['session.driver' => 'database']);

        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->insertSession('session-phone', $user->id);
        $this->insertSession('session-laptop', $user->id);
        $this->insertSession('session-stranger', $other->id);

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload())
            ->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'session-phone']);
        $this->assertDatabaseMissing('sessions', ['id' => 'session-laptop']);

        // Чужие аккаунты не задеты
        $this->assertDatabaseHas('sessions', ['id' => 'session-stranger']);

        // Текущая сессия пережила операцию: пользователь остался внутри
        $this->getJson('/api/auth/me')->assertOk();
    }

    public function test_throttles_repeated_wrong_current_passwords(): void
    {
        $user = User::factory()->create();

        // Лимит 5 в минуту на пользователя
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($user)
                ->putJson('/api/auth/password', $this->payload([
                    'current_password' => 'wrong-password',
                ]))
                ->assertStatus(422);
        }

        $this->actingAs($user)
            ->putJson('/api/auth/password', $this->payload([
                'current_password' => 'wrong-password',
            ]))
            ->assertStatus(429);
    }

    private function insertSession(string $id, int $userId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $userId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => '',
            'last_activity' => time(),
        ]);
    }
}
