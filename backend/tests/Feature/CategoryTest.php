<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategoryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'iv' => base64_encode(random_bytes(12)),
            'ciphertext' => base64_encode(random_bytes(48)),
            'payload_version' => 1,
            ...$overrides,
        ];
    }

    public function test_creates_a_category(): void
    {
        $user = User::factory()->create();
        $payload = $this->payload();

        $this->actingAs($user)
            ->postJson('/api/categories', $payload)
            ->assertCreated()
            ->assertJsonPath('data.ciphertext', $payload['ciphertext']);
    }

    public function test_lists_only_own_categories_in_order(): void
    {
        $user = User::factory()->create();
        Category::factory()->create(['user_id' => $user->id, 'position' => 2]);
        Category::factory()->create(['user_id' => $user->id, 'position' => 1]);
        Category::factory()->create();

        $response = $this->actingAs($user)->getJson('/api/categories');

        $response->assertOk()->assertJsonCount(2, 'data');
        $this->assertSame(1, $response->json('data.0.position'));
    }

    public function test_cannot_touch_someone_elses_category(): void
    {
        $user = User::factory()->create();
        $foreign = Category::factory()->create();

        $this->actingAs($user)
            ->putJson("/api/categories/{$foreign->id}", $this->payload())
            ->assertNotFound();

        $this->actingAs($user)
            ->deleteJson("/api/categories/{$foreign->id}")
            ->assertNotFound();
    }

    /**
     * Каскадное удаление здесь было бы разрушительным: пользователь потерял бы
     * записи, которые не собирался удалять, а восстановить их нельзя — сервер
     * не может их расшифровать даже для показа «вы уверены?».
     */
    public function test_deleting_a_category_keeps_its_posts(): void
    {
        $user = User::factory()->create();
        $category = Category::factory()->create(['user_id' => $user->id]);
        $post = Post::factory()->create([
            'user_id' => $user->id,
            'category_id' => $category->id,
        ]);

        $this->actingAs($user)
            ->deleteJson("/api/categories/{$category->id}")
            ->assertNoContent();

        $this->assertNotSoftDeleted($post);
        $this->assertNull($post->fresh()->category_id);
    }

    public function test_rejects_non_base64_ciphertext(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/categories', $this->payload(['ciphertext' => 'Личное']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('ciphertext');
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/categories')->assertUnauthorized();
    }
}
