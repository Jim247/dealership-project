<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use DateTimeImmutable;
use DateTimeZone;

/**
 * The real wall clock, in UTC. Business-timezone conversions happen in Month.
 */
final class SystemClock implements Clock
{
    public function now(): DateTimeImmutable
    {
        return new DateTimeImmutable('now', new DateTimeZone('UTC'));
    }
}
