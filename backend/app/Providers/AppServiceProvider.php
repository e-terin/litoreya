<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->configureRateLimiting();
    }

    /**
     * Троттлинг входа и регистрации.
     *
     * Два независимых лимита: по IP — против перебора паролей к одному аккаунту,
     * по паре «email + IP» — против размазанного перебора по многим аккаунтам.
     * Срабатывает любой из них.
     */
    private function configureRateLimiting(): void
    {
        RateLimiter::for('auth', function (Request $request) {
            $email = Str::lower((string) $request->input('email'));

            return [
                Limit::perMinute(10)->by($request->ip()),
                Limit::perMinute(5)->by($email.'|'.$request->ip()),
            ];
        });

        /*
         * Операции, подтверждаемые паролем внутри уже открытой сессии: смена
         * пароля и смена ключевой фразы. Обе принимают current_password, то есть
         * тоже перебираемы, — но лимитер auth здесь не годится: он ключуется по
         * полю email, которого в таких запросах нет, и выродился бы в общий
         * счётчик на IP, складывая всех пользователей за одним NAT в одну корзину.
         *
         * Ключ — идентификатор пользователя: перебор осмысленен только против
         * конкретного аккаунта.
         */
        RateLimiter::for('sensitive', function (Request $request) {
            return Limit::perMinute(5)->by((string) $request->user()?->id ?: $request->ip());
        });
    }
}
