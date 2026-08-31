<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Крипто-конверт пользователя (см. docs/crypto-design.md §2).
 *
 * Здесь лежит всё, что нужно клиенту, чтобы развернуть мастер-ключ (DEK), и
 * ничего, что позволяет серверу сделать это самому. Ключевая фраза сюда не
 * попадает ни в каком виде.
 *
 * Все бинарные значения хранятся в base64: объёмы копеечные, а отладка и JSON API
 * заметно проще, чем с VARBINARY.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Параметры вывода KEK из ключевой фразы
            $table->string('kdf_algo', 32)->after('password');
            $table->unsignedInteger('kdf_iterations')->after('kdf_algo');
            $table->string('kdf_salt', 64)->after('kdf_iterations');

            // DEK, обёрнутый ключевой фразой
            $table->string('wrapped_dek', 128)->after('kdf_salt');
            $table->string('wrapped_dek_iv', 32)->after('wrapped_dek');

            // Тот же DEK, обёрнутый recovery-кодом. Единственный путь к данным,
            // если фраза забыта — восстановления через сервер не существует.
            $table->string('recovery_salt', 64)->after('wrapped_dek_iv');
            $table->string('recovery_dek', 128)->after('recovery_salt');
            $table->string('recovery_dek_iv', 32)->after('recovery_dek');

            // Канарейка: ловит рассинхрон обёртки и данных, когда unwrap прошёл,
            // но развернулся не тот DEK (см. crypto-design.md §5.3).
            $table->string('verifier', 128)->after('recovery_dek_iv');
            $table->string('verifier_iv', 32)->after('verifier');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'kdf_algo',
                'kdf_iterations',
                'kdf_salt',
                'wrapped_dek',
                'wrapped_dek_iv',
                'recovery_salt',
                'recovery_dek',
                'recovery_dek_iv',
                'verifier',
                'verifier_iv',
            ]);
        });
    }
};
