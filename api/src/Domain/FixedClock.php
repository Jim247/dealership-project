<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use DateTimeImmutable;

/**
 * A clock frozen at one instant.
 *
 * Used by the unit tests, and by the integration tests through the
 * DEBONAIRE_FIXED_NOW environment variable, so the date rules never drift as
 * real time passes.
 */
final class FixedClock implements Clock
{
    public function __construct(private readonly DateTimeImmutable $now)
    {
    }

    public function now(): DateTimeImmutable
    {
        return $this->now;
    }
}
