<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_endpoint_reports_a_working_stack(): void
    {
        $response = $this->getJson('/api/health');

        $response->assertOk()
            ->assertJson([
                'status' => 'ok',
                'database' => 'up',
            ])
            ->assertJsonStructure(['status', 'php', 'laravel', 'database', 'time']);
    }

    /**
     * Целевая версия PHP на хостинге — 8.2. Если локальная среда уедет вперёд,
     * зависимости и синтаксис могут разойтись с продом незаметно.
     */
    public function test_runs_on_the_php_version_used_in_production(): void
    {
        $this->assertSame('8.2', implode('.', array_slice(explode('.', PHP_VERSION), 0, 2)));
    }
}
