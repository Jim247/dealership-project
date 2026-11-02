<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * The rows, totals and effective filter for one report request.
 *
 * @feature F3 Retrieve returns (spec §3.2)
 * @feature F6 Totals (spec §3.3)
 */
final class ReportResult
{
    /**
     * @param list<DealershipReturn> $returns
     */
    public function __construct(
        public readonly array $returns,
        public readonly Totals $totals,
        public readonly ReportFilter $filter,
    ) {
    }
}
