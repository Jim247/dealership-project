<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * The outcome of submitting a return.
 *
 * @feature F2 Save a return (spec §3.2)
 * @feature F7 Idempotent submission (spec §4 "Duplicate or concurrent submission")
 */
final class SubmitResult
{
    public function __construct(
        public readonly DealershipReturn $return,
        /** True when an Idempotency-Key matched an earlier request and nothing new was stored. */
        public readonly bool $replayed,
    ) {
    }
}
