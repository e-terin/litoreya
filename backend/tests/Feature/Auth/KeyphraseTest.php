<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KeyphraseTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function newWrapper(): array
    {
        return [
            'kdf_algo' => 'PBKDF2-SHA256',
            'kdf_iterations' => 600_000,
            'kdf_salt' => base64_encode(random_bytes(16)),
            'wrapped_dek' => base64_encode(random_bytes(48)),
            'wrapped_dek_iv' => base64_encode(random_bytes(12)),
        ];
    }

    /**
     * Ключевая суть схемы: смена фразы переписывает обёртку мастер-ключа и
     * ничего больше. Verifier и recovery-обёртка привязаны к самому DEK, который
     * не меняется, — иначе пришлось бы перешифровывать все посты.
     */
    public function test_changing_the_keyphrase_only_rewraps_the_master_key(): void
    {
        $user = User::factory()->create();
        $before = $user->cryptoEnvelope();
        $wrapper = $this->newWrapper();

        $response = $this->actingAs($user)->putJson('/api/auth/keyphrase', [
            'current_password' => 'password',
            'crypto' => $wrapper,
        ]);

        $response->assertOk();

        $after = $user->fresh()->cryptoEnvelope();

        $this->assertSame($wrapper['wrapped_dek'], $after['wrapped_dek']);
        $this->assertSame($wrapper['kdf_salt'], $after['kdf_salt']);

        // Не тронуты — DEK прежний
        $this->assertSame($before['verifier'], $after['verifier']);
        $this->assertSame($before['verifier_iv'], $after['verifier_iv']);
        $this->assertSame($before['recovery_dek'], $after['recovery_dek']);
        $this->assertSame($before['recovery_salt'], $after['recovery_salt']);
    }

    /**
     * Угнанной сессии недостаточно: перевыпуск обёртки требует пароля.
     */
    public function test_requires_the_current_password(): void
    {
        $user = User::factory()->create();
        $before = $user->wrapped_dek;

        $response = $this->actingAs($user)->putJson('/api/auth/keyphrase', [
            'current_password' => 'wrong-password',
            'crypto' => $this->newWrapper(),
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('current_password');
        $this->assertSame($before, $user->fresh()->wrapped_dek);
    }

    public function test_requires_authentication(): void
    {
        $this->putJson('/api/auth/keyphrase', [
            'current_password' => 'password',
            'crypto' => $this->newWrapper(),
        ])->assertUnauthorized();
    }

    public function test_rejects_weakened_kdf_parameters(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->putJson('/api/auth/keyphrase', [
            'current_password' => 'password',
            'crypto' => [...$this->newWrapper(), 'kdf_iterations' => 1],
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors('crypto.kdf_iterations');
    }
}
