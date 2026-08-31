<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /**
     * Origin проставляется по умолчанию, потому что его всегда шлёт браузер.
     *
     * Sanctum в cookie-режиме включает сессию только для запросов, опознанных как
     * «свои» по Referer/Origin (EnsureFrontendRequestsAreStateful). Без заголовка
     * сессии нет вовсе, и тесты падали бы с «Session store not set on request» —
     * на поведении, которого в браузере не бывает.
     *
     * Домен должен входить в SANCTUM_STATEFUL_DOMAINS для окружения testing
     * (см. phpunit.xml).
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->withHeader('Origin', 'http://localhost');
    }
}
