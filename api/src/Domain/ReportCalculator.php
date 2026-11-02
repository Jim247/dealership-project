<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * Computes report totals and conversion rates.
 *
 * This is the single source of truth for reported figures. The Next.js page
 * displays these numbers as they are, and the Node CLI recomputes them with
 * the identical formula (shared/src/reporting.ts) and fails if they differ.
 *
 * @feature F6  Totals and overall conversion rate (spec §3.3, §3.4)
 * @feature F13 Canonical conversion-rate formula (spec §4 "Reporting consistency")
 */
final class ReportCalculator
{
    /**
     * Conversion rate in basis points (1 bp = 0.01%), rounded half up.
     *
     * Integer arithmetic only: floor((sales × 10000 × 2 + enquiries) ÷ (enquiries × 2)).
     * Floating point would round some values differently in PHP and JavaScript
     * (e.g. 1.005% becomes "1.00" via JS toFixed). Integers give exactly the
     * same answer in both languages.
     *
     * @return int|null null when there are no enquiries: a rate is undefined, not 0%
     */
    public static function conversionBasisPoints(int $sales, int $enquiries): ?int
    {
        if ($enquiries === 0) {
            return null;
        }

        return intdiv($sales * 10000 * 2 + $enquiries, $enquiries * 2);
    }

    /**
     * Conversion rate as a percentage with at most 2 decimal places, e.g. 23.78.
     */
    public static function conversionRate(int $sales, int $enquiries): ?float
    {
        $basisPoints = self::conversionBasisPoints($sales, $enquiries);

        return $basisPoints === null ? null : $basisPoints / 100;
    }

    /**
     * Totals for exactly the returns given.
     *
     * The caller passes the same rows it shows in the table, so the table and
     * the totals cannot disagree. The overall rate is pooled (total sales ÷
     * total enquiries), not an average of each dealership's rate. Averaging
     * would let a dealership with 9 enquiries count as much as one with 450.
     *
     * @param list<DealershipReturn> $returns
     */
    public function totals(array $returns): Totals
    {
        $enquiries = 0;
        $sales = 0;

        foreach ($returns as $return) {
            $enquiries += $return->enquiries;
            $sales += $return->sales;
        }

        return new Totals(
            returnCount: count($returns),
            totalEnquiries: $enquiries,
            totalSales: $sales,
            conversionRate: self::conversionRate($sales, $enquiries),
        );
    }
}
