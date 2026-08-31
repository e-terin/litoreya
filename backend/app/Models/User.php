<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Поля крипто-конверта. Сервер обращается с ними как с непрозрачными строками:
     * он их хранит и отдаёт владельцу, но расшифровать ничего не может.
     *
     * @var list<string>
     */
    public const CRYPTO_FIELDS = [
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
    ];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        ...self::CRYPTO_FIELDS,
    ];

    /**
     * Крипто-поля скрыты из обычной сериализации намеренно: они нужны клиенту
     * ровно один раз, при входе, и отдаются явно через cryptoEnvelope().
     * Так они не растекаются по всем ответам API.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
        ...self::CRYPTO_FIELDS,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'kdf_iterations' => 'integer',
        ];
    }

    /**
     * Конверт, из которого клиент выводит KEK и разворачивает мастер-ключ.
     *
     * @return array<string, mixed>
     */
    public function cryptoEnvelope(): array
    {
        return $this->only(self::CRYPTO_FIELDS);
    }

    /**
     * Все обращения к записям идут только через эти связи.
     *
     * Так принадлежность пользователю обеспечивается структурой запроса, а не
     * дисциплиной автора контроллера: забыть проверку владельца попросту негде.
     */
    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function categories(): HasMany
    {
        return $this->hasMany(Category::class);
    }
}
