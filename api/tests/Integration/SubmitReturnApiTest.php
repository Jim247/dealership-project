<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F2 save, F3 retrieve-one and F4 validation over real HTTP (spec §3.2,
 * §4 "Client manipulation").
 */
final class SubmitReturnApiTest extends ApiTestCase
{
    /** Riverside Autos has no October 2026 return in the seed, so it is free to submit. */
    private const NEW_RETURN = ['dealershipId' => 'RVA', 'month' => '2026-10', 'enquiries' => 131, 'sales' => 27];

    public function test_saves_a_return_and_returns_it_with_201_and_location(): void
    {
        $response = $this->post('/api/returns', self::NEW_RETURN);

        self::assertSame(201, $response->status, $response->raw);
        $data = $response->json['data'];
        self::assertSame('RVA', $data['dealershipId']);
        self::assertSame('Riverside Autos', $data['dealershipName']);
        self::assertSame('2026-10', $data['month']);
        self::assertSame(131, $data['enquiries']);
        self::assertSame(27, $data['sales']);
        self::assertSame(20.61, $data['conversionRate']);
        self::assertSame('2026-11-15T12:00:00Z', $data['createdAt']);
        self::assertSame('/api/returns/' . $data['id'], $response->header('Location'));
    }

    public function test_a_saved_return_can_be_retrieved(): void
    {
        $created = $this->post('/api/returns', self::NEW_RETURN)->json['data'];

        $fetched = $this->get('/api/returns/' . $created['id']);

        self::assertSame(200, $fetched->status);
        self::assertSame($created, $fetched->json['data']);
    }

    public function test_a_saved_return_appears_in_the_list(): void
    {
        $this->post('/api/returns', self::NEW_RETURN);

        $list = $this->get('/api/returns?from=2026-10&to=2026-10&dealershipId=RVA');

        self::assertSame(1, $list->json['totals']['returnCount']);
        self::assertSame(131, $list->json['data'][0]['enquiries']);
    }

    public function test_accepts_a_zero_enquiry_return(): void
    {
        $response = $this->post('/api/returns', ['dealershipId' => 'MLV', 'month' => '2026-10', 'enquiries' => 0, 'sales' => 0]);

        self::assertSame(201, $response->status, $response->raw);
        self::assertNull($response->json['data']['conversionRate']);
    }

    public function test_returns_every_field_error_together(): void
    {
        // Raw '{}': PHP's json_encode([]) would send a JSON list, which is (rightly) a 400.
        $error = self::assertError($this->post('/api/returns', '{}'), 422, 'validation_failed');

        self::assertSame(['dealershipId', 'month', 'enquiries', 'sales'], array_keys($error['fields']));
    }

    public function test_rejects_sales_greater_than_enquiries(): void
    {
        $response = $this->post('/api/returns', ['enquiries' => 10, 'sales' => 11] + self::NEW_RETURN);

        $error = self::assertError($response, 422, 'validation_failed');
        self::assertStringContainsString('cannot be more than enquiries', $error['fields']['sales']);
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM returns WHERE dealership_id = 'RVA' AND month = '2026-10'"));
    }

    public function test_rejects_an_unknown_dealership(): void
    {
        $error = self::assertError($this->post('/api/returns', ['dealershipId' => 'XYZ'] + self::NEW_RETURN), 422, 'validation_failed');

        self::assertSame('Unknown dealership "XYZ".', $error['fields']['dealershipId']);
    }

    public function test_rejects_a_future_month(): void
    {
        $error = self::assertError($this->post('/api/returns', ['month' => '2026-12'] + self::NEW_RETURN), 422, 'validation_failed');

        self::assertStringContainsString('cannot be in the future', $error['fields']['month']);
    }

    public function test_rejects_negative_and_non_whole_counts(): void
    {
        $error = self::assertError(
            $this->post('/api/returns', ['enquiries' => -1, 'sales' => 2.5] + self::NEW_RETURN),
            422,
            'validation_failed',
        );

        self::assertSame('Enquiries cannot be negative.', $error['fields']['enquiries']);
        self::assertSame('Sales must be a whole number.', $error['fields']['sales']);
    }

    public function test_rejects_numbers_sent_as_strings(): void
    {
        $error = self::assertError(
            $this->post('/api/returns', ['enquiries' => '131', 'sales' => '27'] + self::NEW_RETURN),
            422,
            'validation_failed',
        );

        self::assertArrayHasKey('enquiries', $error['fields']);
        self::assertArrayHasKey('sales', $error['fields']);
    }

    public function test_rejects_client_calculated_totals_and_stores_nothing(): void
    {
        // A tampered client trying to push its own figures (spec §4 "Client manipulation").
        $response = $this->post('/api/returns', self::NEW_RETURN + [
            'conversionRate' => 99.9,
            'totals' => ['totalEnquiries' => 1_000_000],
        ]);

        $error = self::assertError($response, 422, 'validation_failed');
        self::assertArrayHasKey('conversionRate', $error['fields']);
        self::assertArrayHasKey('totals', $error['fields']);
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM returns WHERE dealership_id = 'RVA' AND month = '2026-10'"));
    }

    public function test_rejects_malformed_json(): void
    {
        self::assertError($this->post('/api/returns', '{"dealershipId": "RVA",'), 400, 'invalid_json');
    }

    public function test_rejects_a_json_list_instead_of_an_object(): void
    {
        self::assertError($this->post('/api/returns', '[1, 2, 3]'), 400, 'invalid_json');
    }

    public function test_rejects_a_non_json_content_type(): void
    {
        $response = $this->post(
            '/api/returns',
            'dealershipId=RVA&month=2026-10',
            self::asManager() + ['Content-Type' => 'application/x-www-form-urlencoded'],
        );

        self::assertError($response, 415, 'unsupported_media_type');
    }

    public function test_unknown_return_is_404(): void
    {
        self::assertError($this->get('/api/returns/999999'), 404, 'not_found');
    }

    public function test_non_numeric_return_id_is_404(): void
    {
        self::assertError($this->get('/api/returns/abc'), 404, 'not_found');
    }
}
