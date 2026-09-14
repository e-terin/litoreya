<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Категории становятся деревом.
 *
 * Миграция аддитивная: старый код колонку не знает и продолжает работать, —
 * поэтому откат релиза безопасен (expand/contract, см. docs/DEPLOY.md §2.3).
 *
 * nullOnDelete здесь — страховка, а не основное поведение. Штатно детей
 * поднимает на уровень выше CategoryController::destroy; ключ нужен на случай,
 * если категория будет удалена в обход контроллера — тогда ветка станет
 * корневой, а не оставит ссылку в никуда.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->foreignId('parent_id')
                ->nullable()
                ->after('user_id')
                ->constrained('categories')
                ->nullOnDelete();

            $table->index(['user_id', 'parent_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::table('categories', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'parent_id', 'position']);
            // Внешний ключ снимается до колонки: MySQL не отдаст колонку,
            // на которой висит constraint.
            $table->dropForeign(['parent_id']);
            $table->dropColumn('parent_id');
        });
    }
};
