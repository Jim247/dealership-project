<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use DateTimeImmutable;

/**
 * Source of "now" for the domain.
 *
 * The clock is injected rather than calling time() directly, so the "month
 * cannot be in the future" rule (F4) and the audit timestamps (F8) can be
 * tested deterministically.
 */
interface Clock
{
    public function now(): DateTimeImmutable;
}
