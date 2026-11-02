<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

/**
 * An Idempotency-Key was sent again with a different payload. Mapped to HTTP 422.
 *
 * A key identifies one submission attempt. Reusing it for different data is a
 * client bug, and silently replaying the old result would be misleading.
 *
 * @feature F7 Idempotent submission (spec §4 "Duplicate or concurrent submission")
 */
final class IdempotencyKeyReused extends DomainError
{
    public function __construct()
    {
        parent::__construct(
            'This Idempotency-Key was already used for a different submission. '
            . 'Generate a new key for each new return.',
        );
    }
}
