<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use DateTimeImmutable;
use DateTimeZone;

/**
 * A reporting month in strict YYYY-MM form.
 *
 * @feature F4 Server-side validation: "valid months" (spec §3.2)
 * @feature F3 Period filters for the table and the CLI (spec §3.3, §3.4)
 */
final class Month
{
    /**
     * Business timezone. A UK dealership's month starts at midnight UK time,
     * not UTC, so "is this month in the future?" is answered in this zone.
     */
    public const TIMEZONE = 'Europe/London';

    /**
     * Four-digit year, then 01–12. `\z` (not `$`) so a trailing newline such as
     * "2026-03\n" is rejected rather than silently accepted.
     */
    private const PATTERN = '/^(\d{4})-(0[1-9]|1[0-2])\z/';

    private function __construct(
        public readonly int $year,
        public readonly int $month,
    ) {
    }

    /**
     * Parses a strict YYYY-MM string.
     *
     * @return self|null null for anything else, e.g. "2026-3", "2026-13", " 2026-03" or a non-string
     */
    public static function tryParse(mixed $value): ?self
    {
        if (!is_string($value) || preg_match(self::PATTERN, $value, $matches) !== 1) {
            return null;
        }

        return new self((int) $matches[1], (int) $matches[2]);
    }

    /**
     * The month that is in progress right now, in the UK.
     */
    public static function current(Clock $clock): self
    {
        $now = $clock->now()->setTimezone(new DateTimeZone(self::TIMEZONE));

        return new self((int) $now->format('Y'), (int) $now->format('n'));
    }

    /**
     * @return int negative, zero or positive, in the style of the <=> operator
     */
    public function compare(self $other): int
    {
        return [$this->year, $this->month] <=> [$other->year, $other->month];
    }

    public function isAfter(self $other): bool
    {
        return $this->compare($other) > 0;
    }

    /**
     * Canonical storage and transport form, e.g. "2026-03".
     */
    public function toString(): string
    {
        return sprintf('%04d-%02d', $this->year, $this->month);
    }

    /**
     * Human-readable form for error messages, e.g. "March 2026".
     */
    public function label(): string
    {
        return (new DateTimeImmutable(sprintf('%04d-%02d-01', $this->year, $this->month)))->format('F Y');
    }
}
