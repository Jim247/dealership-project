<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F9 mock access control (spec §4 "Access and audit history").
 */
final class AccessControlApiTest extends ApiTestCase
{
    public function test_requests_without_an_identity_are_refused(): void
    {
        self::assertError($this->get('/api/returns', []), 401, 'missing_identity');
        self::assertError($this->get('/api/dealerships', []), 401, 'missing_identity');
    }

    public function test_an_unknown_role_is_refused(): void
    {
        self::assertError($this->get('/api/returns', ['X-Debonaire-Role' => 'admin']), 401, 'missing_identity');
    }

    public function test_a_dealer_must_name_a_known_dealership(): void
    {
        self::assertError($this->get('/api/returns', ['X-Debonaire-Role' => 'dealer']), 401, 'missing_identity');
        self::assertError($this->get('/api/returns', self::asDealer('XYZ')), 401, 'missing_identity');
    }

    public function test_health_needs_no_identity(): void
    {
        self::assertSame(200, $this->get('/api/health', [])->status);
    }

    public function test_a_dealer_only_sees_their_own_returns(): void
    {
        $response = $this->get('/api/returns', self::asDealer('HBC'));

        self::assertSame(200, $response->status);
        self::assertSame(['HBC'], array_values(array_unique(array_column($response->json['data'], 'dealershipId'))));
        self::assertSame('HBC', $response->json['filter']['dealershipId']);
        self::assertSame(23, $response->json['totals']['totalEnquiries']);
    }

    public function test_a_dealer_cannot_ask_for_another_dealership(): void
    {
        self::assertError($this->get('/api/returns?dealershipId=NGM', self::asDealer('HBC')), 403, 'forbidden');
    }

    public function test_a_dealer_cannot_open_another_dealerships_return(): void
    {
        $northgateId = $this->get('/api/returns?dealershipId=NGM')->json['data'][0]['id'];

        self::assertError($this->get('/api/returns/' . $northgateId, self::asDealer('HBC')), 403, 'forbidden');
        self::assertSame(200, $this->get('/api/returns/' . $northgateId, self::asDealer('NGM'))->status);
    }

    public function test_a_dealer_only_sees_their_own_dealership_in_the_list(): void
    {
        $response = $this->get('/api/dealerships', self::asDealer('RVA'));

        self::assertSame([['id' => 'RVA', 'name' => 'Riverside Autos']], $response->json['data']);
    }

    public function test_a_dealer_can_submit_their_own_return(): void
    {
        $response = $this->post(
            '/api/returns',
            ['dealershipId' => 'RVA', 'month' => '2026-10', 'enquiries' => 10, 'sales' => 1],
            self::asDealer('RVA'),
        );

        self::assertSame(201, $response->status, $response->raw);
    }

    public function test_a_dealer_cannot_submit_for_another_dealership(): void
    {
        $response = $this->post(
            '/api/returns',
            ['dealershipId' => 'RVA', 'month' => '2026-10', 'enquiries' => 10, 'sales' => 1],
            self::asDealer('NGM'),
        );

        self::assertError($response, 403, 'forbidden');
        self::assertSame(0, $this->countRows("SELECT COUNT(*) FROM returns WHERE dealership_id = 'RVA' AND month = '2026-10'"));
    }
}
