<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * A new return that has passed validation and is safe to store.
 *
 * Only ReturnValidator creates these, so holding one proves the data is valid.
 *
 * @feature F2 Save a return (spec §3.2)
 */
final class ReturnInput
{
    public function __construct(
        public readonly string $dealershipId,
        public readonly Month $month,
        public readonly int $enquiries,
        public readonly int $sales,
    ) {
    }

    /**
     * Canonical form used to fingerprint a request for idempotency (F7). Key
     * order is fixed, so the same logical payload always hashes the same way.
     *
     * @return array{dealershipId: string, month: string, enquiries: int, sales: int}
     */
    public function toCanonicalArray(): array
    {
        return [
            'dealershipId' => $this->dealershipId,
            'month' => $this->month->toString(),
            'enquiries' => $this->enquiries,
            'sales' => $this->sales,
        ];
    }
}
