<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Unit;

use DateTimeImmutable;
use Debonaire\Api\Domain\Exception\ValidationFailed;
use Debonaire\Api\Domain\FixedClock;
use Debonaire\Api\Domain\ReturnValidator;
use Debonaire\Api\Tests\Support\InMemoryDealerships;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers F4 server-side validation (spec §3.2, §4 "Client manipulation"),
 * F8 correction validation and F3 filter validation.
 *
 * The clock is frozen at 15 November 2026, so "the current month" is 2026-11.
 */
final class ReturnValidatorTest extends TestCase
{
    private ReturnValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new ReturnValidator(
            new InMemoryDealerships(),
            new FixedClock(new DateTimeImmutable('2026-11-15T12:00:00Z')),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private static function validPayload(array $overrides = []): array
    {
        return array_merge(['dealershipId' => 'NGM', 'month' => '2026-10', 'enquiries' => 120, 'sales' => 30], $overrides);
    }

    /**
     * Runs the validator and returns the field errors, failing if it passed.
     *
     * @param array<array-key, mixed> $payload
     *
     * @return array<string, string>
     */
    private function errorsFor(array $payload): array
    {
        try {
            $this->validator->validateNewReturn($payload);
        } catch (ValidationFailed $e) {
            return $e->fields;
        }

        self::fail('Expected the payload to be rejected.');
    }

    // ---- Happy paths ----------------------------------------------------

    public function test_accepts_a_valid_return(): void
    {
        $input = $this->validator->validateNewReturn(self::validPayload());

        self::assertSame('NGM', $input->dealershipId);
        self::assertSame('2026-10', $input->month->toString());
        self::assertSame(120, $input->enquiries);
        self::assertSame(30, $input->sales);
    }

    public function test_accepts_zero_enquiries_and_zero_sales(): void
    {
        $input = $this->validator->validateNewReturn(self::validPayload(['enquiries' => 0, 'sales' => 0]));

        self::assertSame(0, $input->enquiries);
        self::assertSame(0, $input->sales);
    }

    public function test_accepts_sales_equal_to_enquiries(): void
    {
        $input = $this->validator->validateNewReturn(self::validPayload(['enquiries' => 7, 'sales' => 7]));

        self::assertSame(7, $input->sales);
    }

    public function test_accepts_the_current_month(): void
    {
        $input = $this->validator->validateNewReturn(self::validPayload(['month' => '2026-11']));

        self::assertSame('2026-11', $input->month->toString());
    }

    public function test_accepts_the_maximum_count(): void
    {
        $max = ReturnValidator::MAX_COUNT;
        $input = $this->validator->validateNewReturn(self::validPayload(['enquiries' => $max, 'sales' => $max]));

        self::assertSame($max, $input->enquiries);
    }

    // ---- Required fields ------------------------------------------------

    /**
     * @return iterable<string, array{string, string}>
     */
    public static function requiredFields(): iterable
    {
        yield 'dealership' => ['dealershipId', 'Dealership is required.'];
        yield 'month' => ['month', 'Month is required.'];
        yield 'enquiries' => ['enquiries', 'Enquiries is required.'];
        yield 'sales' => ['sales', 'Sales is required.'];
    }

    #[DataProvider('requiredFields')]
    public function test_rejects_a_missing_required_field(string $field, string $message): void
    {
        $payload = self::validPayload();
        unset($payload[$field]);

        self::assertSame($message, $this->errorsFor($payload)[$field] ?? null);
    }

    #[DataProvider('requiredFields')]
    public function test_treats_null_as_missing(string $field, string $message): void
    {
        self::assertSame($message, $this->errorsFor(self::validPayload([$field => null]))[$field] ?? null);
    }

    public function test_reports_every_problem_at_once(): void
    {
        $errors = $this->errorsFor([]);

        self::assertSame(['dealershipId', 'month', 'enquiries', 'sales'], array_keys($errors));
    }

    // ---- Known dealerships ----------------------------------------------

    public function test_rejects_an_unknown_dealership(): void
    {
        self::assertSame('Unknown dealership "ZZZ".', $this->errorsFor(self::validPayload(['dealershipId' => 'ZZZ']))['dealershipId']);
    }

    public function test_dealership_ids_are_case_sensitive(): void
    {
        self::assertArrayHasKey('dealershipId', $this->errorsFor(self::validPayload(['dealershipId' => 'ngm'])));
    }

    public function test_rejects_a_non_string_dealership(): void
    {
        self::assertStringContainsString('identifier', $this->errorsFor(self::validPayload(['dealershipId' => 42]))['dealershipId']);
    }

    // ---- Valid months -----------------------------------------------------

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function malformedMonths(): iterable
    {
        yield 'month 13' => ['2026-13'];
        yield 'month 00' => ['2026-00'];
        yield 'no zero padding' => ['2026-3'];
        yield 'full date' => ['2026-10-01'];
        yield 'words' => ['October 2026'];
        yield 'number' => [202610];
    }

    #[DataProvider('malformedMonths')]
    public function test_rejects_a_malformed_month(mixed $month): void
    {
        self::assertSame(
            'Month must be in YYYY-MM format, e.g. 2026-03.',
            $this->errorsFor(self::validPayload(['month' => $month]))['month'],
        );
    }

    public function test_rejects_a_future_month(): void
    {
        self::assertSame(
            'Month cannot be in the future. The latest month you can report is 2026-11.',
            $this->errorsFor(self::validPayload(['month' => '2026-12']))['month'],
        );
    }

    // ---- Non-negative whole-number counts --------------------------------

    /**
     * @return iterable<string, array{mixed, string}>
     */
    public static function invalidCounts(): iterable
    {
        yield 'negative' => [-1, 'cannot be negative'];
        yield 'decimal' => [5.5, 'must be a whole number'];
        yield 'float that looks whole (5.0)' => [5.0, 'must be a whole number'];
        yield 'numeric string' => ['5', 'must be a whole number'];
        yield 'empty string' => ['', 'must be a whole number'];
        yield 'boolean' => [true, 'must be a whole number'];
        yield 'array' => [[5], 'must be a whole number'];
        yield 'over the sanity cap' => [ReturnValidator::MAX_COUNT + 1, 'cannot be more than 1,000,000'];
    }

    #[DataProvider('invalidCounts')]
    public function test_rejects_invalid_enquiries(mixed $value, string $fragment): void
    {
        self::assertStringContainsString($fragment, $this->errorsFor(self::validPayload(['enquiries' => $value, 'sales' => 0]))['enquiries']);
    }

    #[DataProvider('invalidCounts')]
    public function test_rejects_invalid_sales(mixed $value, string $fragment): void
    {
        self::assertStringContainsString($fragment, $this->errorsFor(self::validPayload(['sales' => $value]))['sales']);
    }

    // ---- Sales cannot exceed enquiries -----------------------------------

    public function test_rejects_sales_greater_than_enquiries(): void
    {
        self::assertSame(
            'Sales (11) cannot be more than enquiries (10), because sales are conversions of those enquiries.',
            $this->errorsFor(self::validPayload(['enquiries' => 10, 'sales' => 11]))['sales'],
        );
    }

    public function test_rejects_any_sales_when_there_are_zero_enquiries(): void
    {
        self::assertArrayHasKey('sales', $this->errorsFor(self::validPayload(['enquiries' => 0, 'sales' => 1])));
    }

    public function test_does_not_compare_sales_with_invalid_enquiries(): void
    {
        $errors = $this->errorsFor(self::validPayload(['enquiries' => -5, 'sales' => 3]));

        self::assertArrayHasKey('enquiries', $errors);
        self::assertArrayNotHasKey('sales', $errors, 'A valid sales figure should not be blamed for a bad enquiries figure.');
    }

    // ---- Client manipulation (spec §4) -----------------------------------

    /**
     * @return iterable<string, array{string, mixed}>
     */
    public static function clientCalculatedFields(): iterable
    {
        yield 'totals' => ['totals', ['totalEnquiries' => 999999]];
        yield 'conversion rate' => ['conversionRate', 100];
        yield 'id' => ['id', 1];
        yield 'timestamps' => ['createdAt', '2020-01-01T00:00:00Z'];
    }

    #[DataProvider('clientCalculatedFields')]
    public function test_rejects_fields_the_server_calculates_itself(string $field, mixed $value): void
    {
        $errors = $this->errorsFor(self::validPayload([$field => $value]));

        self::assertStringContainsString('calculated by the server', $errors[$field]);
    }

    // ---- Corrections (F8) -------------------------------------------------

    public function test_accepts_a_valid_correction_and_trims_the_reason(): void
    {
        $input = $this->validator->validateCorrection(['enquiries' => 15, 'sales' => 4, 'reason' => '  Late CRM import  ']);

        self::assertSame(15, $input->enquiries);
        self::assertSame(4, $input->sales);
        self::assertSame('Late CRM import', $input->reason);
    }

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function missingReasons(): iterable
    {
        yield 'absent' => [null];
        yield 'empty' => [''];
        yield 'whitespace only' => ['   '];
    }

    #[DataProvider('missingReasons')]
    public function test_a_correction_requires_a_reason(mixed $reason): void
    {
        $payload = ['enquiries' => 15, 'sales' => 4];
        if ($reason !== null) {
            $payload['reason'] = $reason;
        }

        try {
            $this->validator->validateCorrection($payload);
            self::fail('Expected the correction to be rejected.');
        } catch (ValidationFailed $e) {
            self::assertSame('A reason is required for every correction.', $e->fields['reason']);
        }
    }

    public function test_a_correction_reason_has_a_length_limit(): void
    {
        $this->expectException(ValidationFailed::class);

        $this->validator->validateCorrection([
            'enquiries' => 15,
            'sales' => 4,
            'reason' => str_repeat('x', ReturnValidator::MAX_REASON_LENGTH + 1),
        ]);
    }

    public function test_a_correction_cannot_change_the_dealership_or_month(): void
    {
        try {
            $this->validator->validateCorrection(['enquiries' => 15, 'sales' => 4, 'reason' => 'Fix', 'month' => '2026-01', 'dealershipId' => 'HBC']);
            self::fail('Expected the correction to be rejected.');
        } catch (ValidationFailed $e) {
            self::assertStringContainsString('cannot be changed by a correction', $e->fields['month']);
            self::assertStringContainsString('cannot be changed by a correction', $e->fields['dealershipId']);
        }
    }

    public function test_a_correction_still_enforces_sales_within_enquiries(): void
    {
        try {
            $this->validator->validateCorrection(['enquiries' => 3, 'sales' => 4, 'reason' => 'Fix']);
            self::fail('Expected the correction to be rejected.');
        } catch (ValidationFailed $e) {
            self::assertArrayHasKey('sales', $e->fields);
        }
    }

    // ---- Report filters (F3) ---------------------------------------------

    public function test_an_empty_filter_means_everything(): void
    {
        $filter = $this->validator->validateFilter(['from' => '', 'to' => '', 'dealershipId' => '']);

        self::assertSame(['from' => null, 'to' => null, 'dealershipId' => null], $filter->toArray());
    }

    public function test_accepts_a_period_and_dealership(): void
    {
        $filter = $this->validator->validateFilter(['from' => '2026-06', 'to' => '2026-09', 'dealershipId' => 'NGM']);

        self::assertSame(['from' => '2026-06', 'to' => '2026-09', 'dealershipId' => 'NGM'], $filter->toArray());
    }

    public function test_filters_may_cover_future_months(): void
    {
        $filter = $this->validator->validateFilter(['to' => '2030-01']);

        self::assertSame('2030-01', $filter->to?->toString());
    }

    public function test_rejects_an_inverted_period(): void
    {
        try {
            $this->validator->validateFilter(['from' => '2026-09', 'to' => '2026-06']);
            self::fail('Expected the filter to be rejected.');
        } catch (ValidationFailed $e) {
            self::assertSame('The end month cannot be before the start month.', $e->fields['to']);
        }
    }

    public function test_rejects_malformed_filter_values(): void
    {
        try {
            $this->validator->validateFilter(['from' => '2026-6', 'to' => ['2026-09'], 'dealershipId' => 'ZZZ']);
            self::fail('Expected the filter to be rejected.');
        } catch (ValidationFailed $e) {
            self::assertSame(['from', 'to', 'dealershipId'], array_keys($e->fields));
        }
    }
}
