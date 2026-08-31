<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Категории. Название зашифровано так же, как содержимое постов — в открытом
 * виде остаётся только id и порядок сортировки.
 *
 * Следствие: сортировать и искать по названию может только клиент, уже после
 * расшифровки. Это осознанная плата за то, что сервер не знает, как называются
 * разделы пользователя.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('categories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('iv', 32);
            $table->text('ciphertext');
            $table->unsignedSmallInteger('payload_version');

            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['user_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};
