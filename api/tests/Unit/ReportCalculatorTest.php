<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Unit;

use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Domain\ReportCalculator;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers F6 totals and F13 the canonical conversion-rate formula (spec §3.3,
 * §3.4, §4 "Reporting consistency").
 */
final class ReportCalculatorTest extends TestCase
{
    private static function aReturn(int $enquiries, int $sales, string $dealershipId = 'NGM'): DealershipReturn
    {
        return new DealershipReturn(1, $dealershipId, 'Test', '2026-10', $enquiries, $sales, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
    }

    /**
     * Every vector in fixtures/conversion-cases.json. The TypeScript suite
     * reads the same file, so passing in both proves the two implementations agree.
     *
     * @return iterable<string, array{int, int, int|null}>
     */
    public static function sharedConversionCases(): iterable
    {
        $fixture = json_decode(
            (string) file_get_contents(dirname(__DIR__, 3) . '/fixtures/conversion-cases.json'),
            true,
            flags: JSON_THROW_ON_ERROR,
        );

        foreach ($fixture['cases'] as $case) {
            yield $case['name'] => [$case['sales'], $case['enquiries'], $case['basisPoints']];
        }
    }

    #[DataProvider('sharedConversionCases')]
    public function test_matches_every_shared_conversion_vector(int $sales, int $enquiries, ?int $expectedBasisPoints): void
    {
        self::assertSame($expectedBasisPoints, ReportCalculator::conversionBasisPoints($sales, $enquiries));
    }

    public function test_rate_is_basis_points_as_a_percentage(): void
    {
        self::assertSame(23.78, ReportCalculator::conversionRate(497, 2090));
        self::assertNull(ReportCalculator::conversionRate(0, 0));
    }

    public function test_totals_sum_enquiries_and_sales(): void
    {
        $totals = (new ReportCalculator())->totals([self::aReturn(100, 25), self::aReturn(50, 5), self::aReturn(0, 0)]);

        self::assertSame(3, $totals->returnCount);
        self::assertSame(150, $totals->totalEnquiries);
        self::assertSame(30, $totals->totalSales);
        self::assertSame(20.0, $totals->conversionRate);
    }

    public function test_overall_rate_is_pooled_not_an_average_of_rates(): void
    {
        // A busy dealership converting 10% and a tiny one converting 100%.
        // The average of the two rates would be 55%, which overstates the
        // business. The pooled rate is (40 + 4) / (400 + 4) = 10.89%.
        $totals = (new ReportCalculator())->totals([self::aReturn(400, 40), self::aReturn(4, 4)]);

        self::assertSame(10.89, $totals->conversionRate);
    }

    public function test_a_zero_enquiry_return_adds_nothing_but_still_counts_as_a_return(): void
    {
        $calculator = new ReportCalculator();

        $without = $calculator->totals([self::aReturn(10, 2)]);
        $with = $calculator->totals([self::aReturn(10, 2), self::aReturn(0, 0)]);

        self::assertSame($without->conversionRate, $with->conversionRate);
        self::assertSame(2, $with->returnCount);
    }

    public function test_only_zero_enquiry_returns_give_an_na_rate(): void
    {
        $totals = (new ReportCalculator())->totals([self::aReturn(0, 0), self::aReturn(0, 0)]);

        self::assertSame(0, $totals->totalEnquiries);
        self::assertNull($totals->conversionRate);
    }

    public function test_no_returns_gives_zero_totals_and_an_na_rate(): void
    {
        $totals = (new ReportCalculator())->totals([]);

        self::assertSame(
            ['returnCount' => 0, 'totalEnquiries' => 0, 'totalSales' => 0, 'conversionRate' => null],
            $totals->toArray(),
        );
    }

    public function test_each_row_carries_its_own_rate(): void
    {
        self::assertSame(25.0, self::aReturn(100, 25)->toArray()['conversionRate']);
        self::assertNull(self::aReturn(0, 0)->toArray()['conversionRate']);
    }
}
