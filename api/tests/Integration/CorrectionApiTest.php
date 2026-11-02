<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F8 corrections with an audit trail (spec §4 "Access and audit history").
 */
final class CorrectionApiTest extends ApiTestCase
{
    /** Id of the seeded Harbour Cars June 2026 return (14 enquiries, 3 sales). */
    private function harbourJuneId(): int
    {
        return $this->get('/api/returns?from=2026-06&to=2026-06&dealershipId=HBC')->json['data'][0]['id'];
    }

    public function test_a_manager_can_correct_a_return(): void
    {
        $id = $this->harbourJuneId();

        $response = $this->put('/api/returns/' . $id, ['enquiries' => 16, 'sales' => 4, 'reason' => 'Two web enquiries were missed']);

        self::assertSame(200, $response->status, $response->raw);
        self::assertSame(16, $response->json['data']['enquiries']);
        self::assertSame(4, $response->json['data']['sales']);
        self::assertSame(25.0, $response->json['data']['conversionRate']);
        self::assertSame('2026-11-15T12:00:00Z', $response->json['data']['updatedAt']);
        self::assertNotSame($response->json['data']['createdAt'], $response->json['data']['updatedAt']);
    }

    public function test_a_correction_is_recorded_in_the_audit_history(): void
    {
        $id = $this->harbourJuneId();
        $this->put('/api/returns/' . $id, ['enquiries' => 16, 'sales' => 4, 'reason' => 'Two web enquiries were missed']);

        $history = $this->get('/api/returns/' . $id . '/audit')->json['data'];

        self::assertCount(2, $history);
        self::assertSame('created', $history[0]['action']);
        self::assertSame(
            [
                'action' => 'corrected',
                'actorRole' => 'manager',
                'actorDealershipId' => null,
                'before' => ['enquiries' => 14, 'sales' => 3],
                'after' => ['enquiries' => 16, 'sales' => 4],
                'reason' => 'Two web enquiries were missed',
                'createdAt' => '2026-11-15T12:00:00Z',
            ],
            array_diff_key($history[1], ['id' => true]),
        );
    }

    public function test_corrected_figures_flow_through_to_the_totals(): void
    {
        $before = $this->get('/api/returns?dealershipId=HBC')->json['totals'];
        $this->put('/api/returns/' . $this->harbourJuneId(), ['enquiries' => 16, 'sales' => 4, 'reason' => 'Fix']);
        $after = $this->get('/api/returns?dealershipId=HBC')->json['totals'];

        self::assertSame($before['totalEnquiries'] + 2, $after['totalEnquiries']);
        self::assertSame($before['totalSales'] + 1, $after['totalSales']);
    }

    public function test_a_dealer_cannot_correct_even_their_own_return(): void
    {
        $id = $this->harbourJuneId();

        $response = $this->put('/api/returns/' . $id, ['enquiries' => 16, 'sales' => 4, 'reason' => 'Fix'], self::asDealer('HBC'));

        self::assertError($response, 403, 'forbidden');
        self::assertSame(14, $this->get('/api/returns/' . $id)->json['data']['enquiries']);
    }

    public function test_a_dealer_cannot_view_audit_history(): void
    {
        self::assertError($this->get('/api/returns/' . $this->harbourJuneId() . '/audit', self::asDealer('HBC')), 403, 'forbidden');
    }

    public function test_a_correction_without_a_reason_is_rejected_and_nothing_changes(): void
    {
        $id = $this->harbourJuneId();

        $error = self::assertError($this->put('/api/returns/' . $id, ['enquiries' => 16, 'sales' => 4]), 422, 'validation_failed');

        self::assertArrayHasKey('reason', $error['fields']);
        self::assertSame(14, $this->get('/api/returns/' . $id)->json['data']['enquiries']);
        self::assertCount(1, $this->get('/api/returns/' . $id . '/audit')->json['data']);
    }

    public function test_a_correction_must_keep_sales_within_enquiries(): void
    {
        $error = self::assertError(
            $this->put('/api/returns/' . $this->harbourJuneId(), ['enquiries' => 2, 'sales' => 3, 'reason' => 'Fix']),
            422,
            'validation_failed',
        );

        self::assertArrayHasKey('sales', $error['fields']);
    }

    public function test_a_correction_that_changes_nothing_is_rejected(): void
    {
        $id = $this->harbourJuneId();

        self::assertError($this->put('/api/returns/' . $id, ['enquiries' => 14, 'sales' => 3, 'reason' => 'No-op']), 422, 'validation_failed');
        self::assertCount(1, $this->get('/api/returns/' . $id . '/audit')->json['data']);
    }

    public function test_correcting_an_unknown_return_is_404(): void
    {
        self::assertError($this->put('/api/returns/999999', ['enquiries' => 1, 'sales' => 0, 'reason' => 'Fix']), 404, 'not_found');
    }

    public function test_a_new_return_gets_a_created_audit_entry_naming_the_submitter(): void
    {
        $id = $this->post(
            '/api/returns',
            ['dealershipId' => 'RVA', 'month' => '2026-10', 'enquiries' => 10, 'sales' => 1],
            self::asDealer('RVA'),
        )->json['data']['id'];

        $history = $this->get('/api/returns/' . $id . '/audit')->json['data'];

        self::assertCount(1, $history);
        self::assertSame('created', $history[0]['action']);
        self::assertSame('dealer', $history[0]['actorRole']);
        self::assertSame('RVA', $history[0]['actorDealershipId']);
        self::assertNull($history[0]['before']);
    }
}
