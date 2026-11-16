<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F15 end to end: a server started with DEBONAIRE_ACCESS_CODE, as the
 * public demo is. Every other integration test runs without a code, which
 * proves a local run needs none.
 */
final class AccessCodeApiTest extends ApiTestCase
{
    private const CODE = 'integration-test-code-7f3a9c';

    protected static function extraEnvironment(): array
    {
        return ['DEBONAIRE_ACCESS_CODE' => self::CODE];
    }

    /** @return array<string, string> */
    private static function withCode(string $code = self::CODE): array
    {
        return ['Authorization' => 'Bearer ' . $code];
    }

    public function test_the_right_code_works_like_any_other_request(): void
    {
        $response = $this->get('/api/returns', self::asManager() + self::withCode());

        self::assertSame(200, $response->status, $response->raw);
        self::assertSame(10, $response->json['totals']['returnCount']);
    }

    public function test_no_code_is_401_access_code_required(): void
    {
        $response = $this->get('/api/returns', self::asManager());

        $error = self::assertError($response, 401, 'access_code_required');
        self::assertStringContainsString('access code', (string) $error['message']);
        self::assertStringStartsWith('Bearer', (string) $response->header('WWW-Authenticate'));
    }

    public function test_a_wrong_code_is_401_invalid_access_code(): void
    {
        $response = $this->get('/api/returns', self::asManager() + self::withCode('a-guess'));

        self::assertError($response, 401, 'invalid_access_code');
    }

    public function test_the_code_is_checked_before_routing(): void
    {
        // Without the code, even an unknown path gives nothing away.
        self::assertError($this->get('/api/nope', self::asManager()), 401, 'access_code_required');
    }

    public function test_the_code_is_checked_before_identity(): void
    {
        self::assertError($this->get('/api/returns', []), 401, 'access_code_required');
        self::assertError($this->get('/api/returns', self::withCode()), 401, 'missing_identity');
    }

    public function test_a_submission_without_the_code_stores_nothing(): void
    {
        $response = $this->post('/api/returns', [
            'dealershipId' => 'RVA',
            'month' => '2026-10',
            'enquiries' => 131,
            'sales' => 27,
        ], self::asManager());

        self::assertError($response, 401, 'access_code_required');
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM returns WHERE dealership_id = 'RVA' AND month = '2026-10'"));
    }

    public function test_a_submission_with_the_code_is_saved(): void
    {
        $response = $this->post('/api/returns', [
            'dealershipId' => 'RVA',
            'month' => '2026-10',
            'enquiries' => 131,
            'sales' => 27,
        ], self::asManager() + self::withCode());

        self::assertSame(201, $response->status, $response->raw);
    }

    public function test_the_health_check_needs_no_code(): void
    {
        $response = $this->get('/api/health', []);

        self::assertSame(200, $response->status);
        self::assertSame(['status' => 'ok'], $response->json);
    }

    public function test_cors_preflight_needs_no_code_and_allows_the_authorization_header(): void
    {
        $response = $this->send('OPTIONS', '/api/returns', null, [
            'Origin' => self::UI_ORIGIN,
            'Access-Control-Request-Method' => 'GET',
            'Access-Control-Request-Headers' => 'authorization, x-debonaire-role',
        ]);

        self::assertSame(204, $response->status);
        self::assertStringContainsString('Authorization', (string) $response->header('Access-Control-Allow-Headers'));
    }

    public function test_the_401_carries_cors_headers_so_the_page_can_read_it(): void
    {
        $response = $this->get('/api/returns', self::asManager() + ['Origin' => self::UI_ORIGIN]);

        self::assertSame(401, $response->status);
        self::assertSame(self::UI_ORIGIN, $response->header('Access-Control-Allow-Origin'));
    }
}
