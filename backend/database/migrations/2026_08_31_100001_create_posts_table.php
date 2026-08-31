<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Посты. Весь смысл записи — включая заголовок — лежит в ciphertext.
 *
 * В открытом виде остаются только служебные поля:
 *   type          нужен интерфейсу, чтобы выбрать форму и иконку до расшифровки;
 *   category_id   нужен для фильтрации на сервере без чтения содержимого;
 *   payload_version — формат открытого текста будет меняться, а мигрировать его
 *                   может только клиент: серверная миграция до содержимого
 *                   не достаёт (docs/crypto-design.md §2.3).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained()->nullOnDelete();

            $table->string('type', 16);

            $table->string('iv', 32);
            // mediumText, а не text: заметка может быть длинной, а base64 добавляет
            // сверху треть объёма
            $table->mediumText('ciphertext');
            $table->unsignedSmallInteger('payload_version');

            $table->timestamps();
            // Нужен для инкрементального синка в офлайн-режиме (фаза 5):
            // клиент должен узнать об удалении, а не просто не увидеть запись
            $table->softDeletes();

            $table->index(['user_id', 'updated_at']);
            $table->index(['user_id', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
    }
};
