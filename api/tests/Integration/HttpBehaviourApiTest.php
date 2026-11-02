<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers protocol behaviour shared by every endpoint: CORS for the Next.js UI,
 * routing errors and the error envelope.
 */
final class HttpBehaviourApiTest extends ApiTestCase
{
    public function test_cors_preflight_allows_the_ui_origin_and_identity_headers(): void
    {
        $response = $this->send('OPTIONS', '/api/returns', null, [
            'Origin' => self::UI_ORIGIN,
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'content-type, idempotency-key, x-debonaire-role',
        ]);

        self::assertSame(204, $response->status);
        self::assertSame(self::UI_ORIGIN, $response->header('Access-Control-Allow-Origin'));
        self::assertStringContainsString('POST', (string) $response->header('Access-Control-Allow-Methods'));
        self::assertStringContainsString('Idempotency-Key', (string) $response->header('Access-Control-Allow-Headers'));
        self::assertStringContainsString('X-Debonaire-Role', (string) $response->header('Access-Control-Allow-Headers'));
    }

    public function test_responses_to_the_ui_origin_carry_cors_headers(): void
    {
        $response = $this->get('/api/returns', self::asManager() + ['Origin' => self::UI_ORIGIN]);

        self::assertSame(self::UI_ORIGIN, $response->header('Access-Control-Allow-Origin'));
        self::assertStringContainsString('Idempotent-Replayed', (string) $response->header('Access-Control-Expose-Headers'));
    }

    public function test_other_origins_are_not_allowed(): void
    {
        $response = $this->get('/api/returns', self::asManager() + ['Origin' => 'https://evil.example']);

        self::assertNull($response->header('Access-Control-Allow-Origin'));
    }

    public function test_unknown_paths_are_404(): void
    {
        self::assertError($this->get('/api/nope'), 404, 'not_found');
    }

    public function test_unsupported_methods_are_405_with_allow_header(): void
    {
        $response = $this->send('DELETE', '/api/returns/1', null, self::asManager());

        self::assertError($response, 405, 'method_not_allowed');
        self::assertSame('GET, PUT', $response->header('Allow'));
    }

    public function test_errors_never_leak_internals(): void
    {
        $response = $this->post('/api/returns', '{not json');

        self::assertStringNotContainsString('Exception', $response->raw);
        self::assertStringNotContainsString('.php', $response->raw);
    }

    public function test_responses_are_json_and_not_cached(): void
    {
        $response = $this->get('/api/returns');

        self::assertStringStartsWith('application/json', (string) $response->header('Content-Type'));
        self::assertSame('no-store', $response->header('Cache-Control'));
    }
}
