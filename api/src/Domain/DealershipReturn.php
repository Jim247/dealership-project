<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * A stored monthly return, as read back from the database.
 *
 * @feature F3 Retrieve returns (spec §3.2)
 * @feature F6 Per-row conversion rate (spec §3.3)
 */
final class DealershipReturn
{
    public function __construct(
        public readonly int $id,
        public readonly string $dealershipId,
        public readonly string $dealershipName,
        public readonly string $month,
        public readonly int $enquiries,
        public readonly int $sales,
        public readonly string $createdAt,
        public readonly string $updatedAt,
    ) {
    }

    /**
     * API representation. The per-row conversion rate is always derived on the
     * server and never accepted from the client.
     *
     * @return array<string, int|float|string|null>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'dealershipId' => $this->dealershipId,
            'dealershipName' => $this->dealershipName,
            'month' => $this->month,
            'enquiries' => $this->enquiries,
            'sales' => $this->sales,
            'conversionRate' => ReportCalculator::conversionRate($this->sales, $this->enquiries),
            'createdAt' => $this->createdAt,
            'updatedAt' => $this->updatedAt,
        ];
    }
}
