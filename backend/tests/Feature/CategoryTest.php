<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Post;
use App\Models\User;
use App\Rules\CategoryParent;
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

    public function test_creates_a_nested_category(): void
    {
        $user = User::factory()->create();
        $parent = Category::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)
            ->postJson('/api/categories', $this->payload(['parent_id' => $parent->id]))
            ->assertCreated()
            ->assertJsonPath('data.parent_id', $parent->id);
    }

    public function test_cannot_nest_under_someone_elses_category(): void
    {
        $user = User::factory()->create();
        $stranger = Category::factory()->create();

        $this->actingAs($user)
            ->postJson('/api/categories', $this->payload(['parent_id' => $stranger->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_cannot_be_its_own_parent(): void
    {
        $user = User::factory()->create();
        $category = Category::factory()->create(['user_id' => $user->id]);

        $this->actingAs($user)
            ->putJson("/api/categories/{$category->id}", $this->payload([
                'parent_id' => $category->id,
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    /**
     * Перенос внутрь собственного потомка отрезал бы ветку от корня: в базе
     * она осталась бы, а в выдачу не попала.
     */
    public function test_cannot_move_into_its_own_descendant(): void
    {
        $user = User::factory()->create();
        $root = Category::factory()->create(['user_id' => $user->id]);
        $child = Category::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $root->id,
        ]);

        $this->actingAs($user)
            ->putJson("/api/categories/{$root->id}", $this->payload([
                'parent_id' => $child->id,
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_rejects_nesting_deeper_than_the_limit(): void
    {
        $user = User::factory()->create();

        $parent = null;
        for ($level = 0; $level < CategoryParent::MAX_DEPTH; $level++) {
            $parent = Category::factory()->create([
                'user_id' => $user->id,
                'parent_id' => $parent?->id,
            ]);
        }

        $this->actingAs($user)
            ->postJson('/api/categories', $this->payload(['parent_id' => $parent->id]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_allows_nesting_up_to_the_limit(): void
    {
        $user = User::factory()->create();

        $parent = null;
        for ($level = 0; $level < CategoryParent::MAX_DEPTH - 1; $level++) {
            $parent = Category::factory()->create([
                'user_id' => $user->id,
                'parent_id' => $parent?->id,
            ]);
        }

        $this->actingAs($user)
            ->postJson('/api/categories', $this->payload(['parent_id' => $parent->id]))
            ->assertCreated();
    }

    /**
     * Глубину считает не только родитель: категория со своим поддеревом,
     * переезжая, тащит его с собой.
     */
    public function test_rejects_move_that_pushes_a_subtree_past_the_limit(): void
    {
        $user = User::factory()->create();

        // ветка из MAX_DEPTH - 1 уровней, в которую переносим
        $target = null;
        for ($level = 0; $level < CategoryParent::MAX_DEPTH - 1; $level++) {
            $target = Category::factory()->create([
                'user_id' => $user->id,
                'parent_id' => $target?->id,
            ]);
        }

        // отдельная ветка высотой 2: сама категория и её ребёнок
        $moving = Category::factory()->create(['user_id' => $user->id]);
        Category::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $moving->id,
        ]);

        $this->actingAs($user)
            ->putJson("/api/categories/{$moving->id}", $this->payload([
                'parent_id' => $target->id,
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('parent_id');
    }

    public function test_deleting_a_category_lifts_its_children_one_level_up(): void
    {
        $user = User::factory()->create();
        $grandparent = Category::factory()->create(['user_id' => $user->id]);
        $parent = Category::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $grandparent->id,
        ]);
        $child = Category::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $parent->id,
        ]);

        $this->actingAs($user)
            ->deleteJson("/api/categories/{$parent->id}")
            ->assertNoContent();

        $this->assertSame($grandparent->id, $child->fresh()->parent_id);
    }

    public function test_deleting_a_root_category_makes_its_children_roots(): void
    {
        $user = User::factory()->create();
        $root = Category::factory()->create(['user_id' => $user->id]);
        $child = Category::factory()->create([
            'user_id' => $user->id,
            'parent_id' => $root->id,
        ]);

        $this->actingAs($user)
            ->deleteJson("/api/categories/{$root->id}")
            ->assertNoContent();

        $this->assertNotNull($child->fresh());
        $this->assertNull($child->fresh()->parent_id);
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
