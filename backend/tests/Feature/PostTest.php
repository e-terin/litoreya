<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PostTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'type' => 'password',
            'iv' => base64_encode(random_bytes(12)),
            'ciphertext' => base64_encode(random_bytes(128)),
            'payload_version' => 1,
            ...$overrides,
        ];
    }

    public function test_creates_a_post(): void
    {
        $user = User::factory()->create();
        $payload = $this->payload();

        $response = $this->actingAs($user)->postJson('/api/posts', $payload);

        $response->assertCreated()
            ->assertJsonPath('data.ciphertext', $payload['ciphertext'])
            ->assertJsonPath('data.type', 'password');

        $this->assertDatabaseHas('posts', [
            'user_id' => $user->id,
            'ciphertext' => $payload['ciphertext'],
        ]);
    }

    public function test_lists_only_own_posts(): void
    {
        $user = User::factory()->create();
        $stranger = User::factory()->create();

        Post::factory()->count(3)->create(['user_id' => $user->id]);
        Post::factory()->count(2)->create(['user_id' => $stranger->id]);

        $response = $this->actingAs($user)->getJson('/api/posts');

        $response->assertOk()->assertJsonCount(3, 'data');
    }

    /**
     * 404, а не 403: иначе по коду ответа можно было бы перебором выяснять,
     * какие id существуют у других пользователей.
     */
    public function test_cannot_read_someone_elses_post(): void
    {
        $user = User::factory()->create();
        $foreign = Post::factory()->create();

        $this->actingAs($user)->getJson("/api/posts/{$foreign->id}")->assertNotFound();
    }

    public function test_cannot_update_someone_elses_post(): void
    {
        $user = User::factory()->create();
        $foreign = Post::factory()->create();
        $before = $foreign->ciphertext;

        $this->actingAs($user)
            ->putJson("/api/posts/{$foreign->id}", $this->payload())
            ->assertNotFound();

        $this->assertSame($before, $foreign->fresh()->ciphertext);
    }

    public function test_cannot_delete_someone_elses_post(): void
    {
        $user = User::factory()->create();
        $foreign = Post::factory()->create();

        $this->actingAs($user)
            ->deleteJson("/api/posts/{$foreign->id}")
            ->assertNotFound();

        $this->assertNotSoftDeleted($foreign);
    }

    /**
     * Чужой id категории не должен ни привязываться, ни отличаться в ответе от
     * несуществующего.
     */
    public function test_cannot_attach_someone_elses_category(): void
    {
        $user = User::factory()->create();
        $foreign = Category::factory()->create();

        $response = $this->actingAs($user)->postJson('/api/posts', $this->payload([
            'category_id' => $foreign->id,
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('category_id');
    }

    public function test_updates_own_post(): void
    {
        $user = User::factory()->create();
        $post = Post::factory()->create(['user_id' => $user->id]);
        $payload = $this->payload(['type' => 'text']);

        $response = $this->actingAs($user)->putJson("/api/posts/{$post->id}", $payload);

        $response->assertOk()->assertJsonPath('data.ciphertext', $payload['ciphertext']);
    }

    public function test_soft_deletes_own_post(): void
    {
        $user = User::factory()->create();
        $post = Post::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)->deleteJson("/api/posts/{$post->id}")->assertNoContent();

        $this->assertSoftDeleted($post);
        $this->actingAs($user)->getJson('/api/posts')->assertJsonCount(0, 'data');
    }

    /**
     * Офлайн-клиент должен узнать об удалении, а не просто перестать видеть
     * запись — иначе она останется в его локальной копии навсегда.
     */
    public function test_incremental_sync_includes_deleted_posts(): void
    {
        $user = User::factory()->create();
        $post = Post::factory()->create(['user_id' => $user->id]);

        $since = now()->subMinute()->toIso8601String();
        $post->delete();

        $response = $this->actingAs($user)
            ->getJson('/api/posts?updated_since='.urlencode($since));

        $response->assertOk()->assertJsonCount(1, 'data');
        $this->assertNotNull($response->json('data.0.deleted_at'));
    }

    public function test_filters_by_category(): void
    {
        $user = User::factory()->create();
        $category = Category::factory()->create(['user_id' => $user->id]);

        Post::factory()->count(2)->create([
            'user_id' => $user->id,
            'category_id' => $category->id,
        ]);
        Post::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)
            ->getJson("/api/posts?category_id={$category->id}")
            ->assertJsonCount(2, 'data');

        $this->actingAs($user)
            ->getJson('/api/posts?category_id=none')
            ->assertJsonCount(1, 'data');
    }

    public function test_rejects_unknown_type(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/posts', $this->payload(['type' => 'video']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('type');
    }

    public function test_rejects_iv_of_wrong_size(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/posts', $this->payload(['iv' => base64_encode(random_bytes(8))]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('iv');
    }

    public function test_rejects_non_base64_ciphertext(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/posts', $this->payload(['ciphertext' => 'открытый текст!']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('ciphertext');
    }

    /**
     * Запись, созданную клиентом более новой версии, приняли бы молча, а
     * расшифровать её потом не смог бы никто.
     */
    public function test_rejects_payload_version_from_the_future(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/posts', $this->payload(['payload_version' => 99]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('payload_version');
    }

    public function test_requires_authentication(): void
    {
        $this->getJson('/api/posts')->assertUnauthorized();
        $this->postJson('/api/posts', $this->payload())->assertUnauthorized();
    }
}
