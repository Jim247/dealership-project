<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F3 filtered retrieval and F6 server-side totals
 * (spec §3.3, §3.4, §4 "Reporting consistency").
 *
 * Expected figures come straight from the seed in Seeder::RETURNS.
 */
final class ReportingApiTest extends ApiTestCase
{
    public function test_all_returns_with_totals(): void
    {
        $response = $this->get('/api/returns');

        self::assertSame(200, $response->status);
        self::assertCount(10, $response->json['data']);
        self::assertSame(
            ['returnCount' => 10, 'totalEnquiries' => 2090, 'totalSales' => 497, 'conversionRate' => 23.78],
            $response->json['totals'],
        );
    }

    public function test_totals_always_equal_the_sum_of_the_rows_returned(): void
    {
        foreach (['', '?from=2026-07', '?to=2026-07', '?dealershipId=HBC', '?from=2026-06&to=2026-09&dealershipId=NGM'] as $query) {
            $response = $this->get('/api/returns' . $query);
            $rows = $response->json['data'];

            self::assertSame(count($rows), $response->json['totals']['returnCount'], $query);
            self::assertSame(array_sum(array_column($rows, 'enquiries')), $response->json['totals']['totalEnquiries'], $query);
            self::assertSame(array_sum(array_column($rows, 'sales')), $response->json['totals']['totalSales'], $query);
        }
    }

    public function test_rows_are_newest_month_first_then_by_dealership_name(): void
    {
        $rows = $this->get('/api/returns?from=2026-09&to=2026-10')->json['data'];

        self::assertSame(
            [['2026-10', 'NGM'], ['2026-09', 'HBC'], ['2026-09', 'NGM'], ['2026-09', 'RVA']],
            array_map(static fn (array $r): array => [$r['month'], $r['dealershipId']], $rows),
        );
    }

    public function test_period_bounds_are_inclusive(): void
    {
        $months = array_unique(array_column($this->get('/api/returns?from=2026-07&to=2026-09')->json['data'], 'month'));
        sort($months);

        self::assertSame(['2026-07', '2026-09'], array_values($months));
    }

    public function test_a_month_with_no_returns_gives_zero_totals_and_na_rate(): void
    {
        $response = $this->get('/api/returns?from=2026-08&to=2026-08');

        self::assertSame(200, $response->status);
        self::assertSame([], $response->json['data']);
        self::assertSame(
            ['returnCount' => 0, 'totalEnquiries' => 0, 'totalSales' => 0, 'conversionRate' => null],
            $response->json['totals'],
        );
    }

    public function test_a_zero_enquiry_return_is_listed_with_an_na_rate_and_does_not_skew_totals(): void
    {
        $response = $this->get('/api/returns?from=2026-07&to=2026-07');

        $harbour = array_values(array_filter($response->json['data'], static fn (array $r): bool => $r['dealershipId'] === 'HBC'))[0];
        self::assertSame(0, $harbour['enquiries']);
        self::assertNull($harbour['conversionRate']);

        // 88 + 29 + 0 sales over 389 + 140 + 0 enquiries.
        self::assertSame(
            ['returnCount' => 3, 'totalEnquiries' => 529, 'totalSales' => 117, 'conversionRate' => 22.12],
            $response->json['totals'],
        );
    }

    public function test_filters_by_dealership(): void
    {
        $response = $this->get('/api/returns?dealershipId=NGM');

        self::assertSame(['NGM'], array_values(array_unique(array_column($response->json['data'], 'dealershipId'))));
        self::assertSame(
            ['returnCount' => 4, 'totalEnquiries' => 1682, 'totalSales' => 410, 'conversionRate' => 24.38],
            $response->json['totals'],
        );
    }

    public function test_a_dealership_with_no_returns_gives_an_empty_report(): void
    {
        $response = $this->get('/api/returns?dealershipId=MLV');

        self::assertSame([], $response->json['data']);
        self::assertNull($response->json['totals']['conversionRate']);
    }

    public function test_echoes_the_filter_that_was_applied(): void
    {
        $response = $this->get('/api/returns?from=2026-06&to=2026-07&dealershipId=RVA');

        self::assertSame(['from' => '2026-06', 'to' => '2026-07', 'dealershipId' => 'RVA'], $response->json['filter']);
    }

    public function test_an_inverted_period_is_rejected(): void
    {
        $error = self::assertError($this->get('/api/returns?from=2026-09&to=2026-06'), 422, 'validation_failed');

        self::assertArrayHasKey('to', $error['fields']);
    }

    public function test_a_malformed_period_is_rejected(): void
    {
        $error = self::assertError($this->get('/api/returns?from=June'), 422, 'validation_failed');

        self::assertArrayHasKey('from', $error['fields']);
    }

    public function test_lists_dealerships_for_a_manager(): void
    {
        $response = $this->get('/api/dealerships');

        self::assertSame(
            ['HBC', 'MLV', 'NGM', 'RVA'],
            array_column($response->json['data'], 'id'),
            'Dealerships are ordered by name: Harbour, Meadow Lane, Northgate, Riverside.',
        );
    }
}
