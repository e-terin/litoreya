<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Post extends Model
{
    use HasFactory, SoftDeletes;

    /** Типы записей. Открыты серверу: интерфейсу нужна форма до расшифровки. */
    public const TYPES = ['text', 'password'];

    protected $fillable = [
        'category_id',
        'type',
        'iv',
        'ciphertext',
        'payload_version',
    ];

    protected function casts(): array
    {
        return [
            'payload_version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    /**
     * Записи, изменённые после указанного момента, включая удалённые.
     *
     * Удалённые нужны именно здесь: клиент в офлайне должен узнать, что запись
     * пропала, а не просто перестать её видеть в выдаче.
     */
    public function scopeChangedSince(Builder $query, string $since): Builder
    {
        return $query->withTrashed()->where('updated_at', '>', $since);
    }
}
