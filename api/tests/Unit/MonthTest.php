<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Unit;

use DateTimeImmutable;
use Debonaire\Api\Domain\FixedClock;
use Debonaire\Api\Domain\Month;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers F4 "valid months" and the month arithmetic behind the F3 period filters.
 */
final class MonthTest extends TestCase
{
    public function test_parses_a_strict_year_month(): void
    {
        $month = Month::tryParse('2026-03');

        self::assertNotNull($month);
        self::assertSame(2026, $month->year);
        self::assertSame(3, $month->month);
        self::assertSame('2026-03', $month->toString());
        self::assertSame('March 2026', $month->label());
    }

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function invalidMonths(): iterable
    {
        yield 'month 13' => ['2026-13'];
        yield 'month 00' => ['2026-00'];
        yield 'single-digit month' => ['2026-3'];
        yield 'full date' => ['2026-03-01'];
        yield 'leading space' => [' 2026-03'];
        yield 'trailing newline' => ["2026-03\n"];
        yield 'slash separator' => ['2026/03'];
        yield 'two-digit year' => ['26-03'];
        yield 'empty string' => [''];
        yield 'integer' => [202603];
        yield 'null' => [null];
        yield 'array' => [['2026-03']];
    }

    #[DataProvider('invalidMonths')]
    public function test_rejects_anything_that_is_not_strict_yyyy_mm(mixed $value): void
    {
        self::assertNull(Month::tryParse($value));
    }

    public function test_compares_months_chronologically(): void
    {
        $dec = Month::tryParse('2025-12');
        $jan = Month::tryParse('2026-01');

        self::assertNotNull($dec);
        self::assertNotNull($jan);
        self::assertTrue($jan->isAfter($dec));
        self::assertFalse($dec->isAfter($jan));
        self::assertSame(0, $jan->compare(Month::tryParse('2026-01')));
    }

    public function test_current_month_uses_uk_time_not_utc(): void
    {
        // 23:30 UTC on 31 May is already 00:30 on 1 June in London (BST, UTC+1).
        $clock = new FixedClock(new DateTimeImmutable('2026-05-31T23:30:00Z'));

        self::assertSame('2026-06', Month::current($clock)->toString());
    }

    public function test_current_month_in_winter_matches_utc(): void
    {
        // GMT = UTC in winter, so late on 30 November is still November.
        $clock = new FixedClock(new DateTimeImmutable('2026-11-30T23:30:00Z'));

        self::assertSame('2026-11', Month::current($clock)->toString());
    }
}
