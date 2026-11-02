<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

use DateTimeImmutable;
use DateTimeZone;
use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Domain\Month;

/**
 * A return already exists for this dealership and month. Mapped to HTTP 409.
 *
 * The message is written for the person at the form. It names the dealership,
 * the month and when the original was submitted, and says what to do next.
 * That is the "useful error" the spec asks for.
 *
 * @feature F5 Duplicate rejection (spec §3.2)
 */
final class DuplicateReturn extends DomainError
{
    public function __construct(public readonly DealershipReturn $existing)
    {
        $month = Month::tryParse($existing->month);
        $submitted = (new DateTimeImmutable($existing->createdAt))
            ->setTimezone(new DateTimeZone(Month::TIMEZONE))
            ->format('j M Y');

        parent::__construct(sprintf(
            '%s already has a return for %s (submitted %s). Each dealership can submit one return per month. '
            . 'To change the figures, correct the existing return instead.',
            $existing->dealershipName,
            $month?->label() ?? $existing->month,
            $submitted,
        ));
    }
}
