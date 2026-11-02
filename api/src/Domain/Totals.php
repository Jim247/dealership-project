<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * Aggregate figures for a set of returns.
 *
 * @feature F6 Totals and overall conversion rate (spec §3.3, §3.4)
 */
final class Totals
{
    public function __construct(
        public readonly int $returnCount,
        public readonly int $totalEnquiries,
        public readonly int $totalSales,
        /** Percentage to 2 dp, or null when there were no enquiries (shown as "N/A"). */
        public readonly ?float $conversionRate,
    ) {
    }

    /**
     * @return array{returnCount: int, totalEnquiries: int, totalSales: int, conversionRate: float|null}
     */
    public function toArray(): array
    {
        return [
            'returnCount' => $this->returnCount,
            'totalEnquiries' => $this->totalEnquiries,
            'totalSales' => $this->totalSales,
            'conversionRate' => $this->conversionRate,
        ];
    }
}
