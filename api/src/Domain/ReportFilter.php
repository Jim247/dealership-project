<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * A validated period and dealership filter for listing returns.
 *
 * Both month bounds are inclusive and optional, so an open-ended range is allowed.
 *
 * @feature F3 Filterable retrieval (spec §3.3, §3.4)
 */
final class ReportFilter
{
    public function __construct(
        public readonly ?Month $from,
        public readonly ?Month $to,
        public readonly ?string $dealershipId,
    ) {
    }

    /**
     * Returns a copy limited to one dealership. AccessPolicy uses this to scope
     * a dealer's view.
     */
    public function withDealership(?string $dealershipId): self
    {
        return new self($this->from, $this->to, $dealershipId);
    }

    /**
     * Echoed back to the client so it can show exactly which filter the totals cover.
     *
     * @return array{from: string|null, to: string|null, dealershipId: string|null}
     */
    public function toArray(): array
    {
        return [
            'from' => $this->from?->toString(),
            'to' => $this->to?->toString(),
            'dealershipId' => $this->dealershipId,
        ];
    }
}
