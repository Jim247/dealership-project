<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use Debonaire\Api\Domain\Exception\ValidationFailed;

/**
 * Validates everything a client sends before it reaches the database.
 *
 * Nothing from the browser is trusted. The Next.js form runs similar checks
 * for a quicker response, but this class is the authority. A client that skips
 * the form (curl, devtools, a modified page) hits exactly these rules.
 *
 * Every field is checked and all problems are returned together, so the user
 * can fix the whole form in one go instead of one error at a time.
 *
 * @feature F4 Server-side validation (spec §3.2, §4 "Client manipulation")
 * @feature F8 Correction validation (spec §4 "Access and audit history")
 * @feature F3 Period filter validation (spec §3.3, §3.4)
 */
final class ReturnValidator
{
    /**
     * Sanity cap on any single count. This is an assumption, not a spec rule
     * (see README). It catches typos such as extra zeros, which would distort
     * every aggregate.
     */
    public const MAX_COUNT = 1_000_000;

    /** Keeps audit entries readable. */
    public const MAX_REASON_LENGTH = 500;

    /** The only fields a new return may contain. */
    private const NEW_RETURN_FIELDS = ['dealershipId', 'month', 'enquiries', 'sales'];

    /** The only fields a correction may contain. */
    private const CORRECTION_FIELDS = ['enquiries', 'sales', 'reason'];

    public function __construct(
        private readonly DealershipLookup $dealerships,
        private readonly Clock $clock,
    ) {
    }

    /**
     * Validates the body of POST /api/returns.
     *
     * @param array<array-key, mixed> $payload the decoded JSON object
     *
     * @throws ValidationFailed listing every invalid field
     */
    public function validateNewReturn(array $payload): ReturnInput
    {
        $errors = $this->unexpectedFieldErrors($payload, self::NEW_RETURN_FIELDS);

        $dealershipId = $this->dealershipId($payload, $errors);
        $month = $this->month($payload, $errors);
        $enquiries = $this->count($payload, 'enquiries', 'Enquiries', $errors);
        $sales = $this->count($payload, 'sales', 'Sales', $errors);
        $this->salesWithinEnquiries($enquiries, $sales, $errors);

        if ($errors !== [] || $dealershipId === null || $month === null || $enquiries === null || $sales === null) {
            throw new ValidationFailed($errors);
        }

        return new ReturnInput($dealershipId, $month, $enquiries, $sales);
    }

    /**
     * Validates the body of PUT /api/returns/{id}.
     *
     * @param array<array-key, mixed> $payload the decoded JSON object
     *
     * @throws ValidationFailed listing every invalid field
     */
    public function validateCorrection(array $payload): CorrectionInput
    {
        $errors = $this->unexpectedFieldErrors($payload, self::CORRECTION_FIELDS);

        // The dealership and month identify the return, so they cannot change.
        // Say so plainly instead of giving the generic "unexpected field" message.
        foreach (['dealershipId', 'month'] as $identityField) {
            if (array_key_exists($identityField, $payload)) {
                $errors[$identityField] = 'The dealership and month cannot be changed by a correction. '
                    . 'If the month is wrong, submit a new return for the right month.';
            }
        }

        $enquiries = $this->count($payload, 'enquiries', 'Enquiries', $errors);
        $sales = $this->count($payload, 'sales', 'Sales', $errors);
        $this->salesWithinEnquiries($enquiries, $sales, $errors);
        $reason = $this->reason($payload, $errors);

        if ($errors !== [] || $enquiries === null || $sales === null || $reason === null) {
            throw new ValidationFailed($errors, 'The correction could not be saved. Please fix the highlighted fields.');
        }

        return new CorrectionInput($enquiries, $sales, $reason);
    }

    /**
     * Validates the query string of GET /api/returns.
     *
     * Empty values count as "not set", because an HTML form with a blank date
     * field sends `from=`. Future months are allowed here: filtering on them
     * simply returns nothing.
     *
     * @param array<array-key, mixed> $query
     *
     * @throws ValidationFailed for malformed months, an inverted range or an unknown dealership
     */
    public function validateFilter(array $query): ReportFilter
    {
        $errors = [];
        $months = [];

        foreach (['from' => 'From', 'to' => 'To'] as $field => $label) {
            $raw = $query[$field] ?? '';
            $months[$field] = null;

            if ($raw === '') {
                continue;
            }

            $months[$field] = Month::tryParse($raw);
            if ($months[$field] === null) {
                $errors[$field] = sprintf('%s must be a month in YYYY-MM format, e.g. 2026-03.', $label);
            }
        }

        if ($months['from'] !== null && $months['to'] !== null && $months['from']->isAfter($months['to'])) {
            $errors['to'] = 'The end month cannot be before the start month.';
        }

        $dealershipId = $query['dealershipId'] ?? '';
        if ($dealershipId === '') {
            $dealershipId = null;
        } elseif (!is_string($dealershipId) || !$this->dealerships->exists($dealershipId)) {
            $errors['dealershipId'] = 'Unknown dealership.';
        }

        if ($errors !== []) {
            throw new ValidationFailed($errors, 'The report filter is not valid.');
        }

        /** @var string|null $dealershipId */
        return new ReportFilter($months['from'], $months['to'], $dealershipId);
    }

    /**
     * Rejects any field the endpoint does not accept.
     *
     * This closes the "client sends its own totals" hole (spec §4). A field
     * such as `totals` or `conversionRate` is refused loudly rather than
     * ignored, so a misbehaving client finds out straight away.
     *
     * @param array<array-key, mixed> $payload
     * @param list<string>            $allowed
     *
     * @return array<string, string>
     */
    private function unexpectedFieldErrors(array $payload, array $allowed): array
    {
        $errors = [];

        foreach (array_keys($payload) as $field) {
            $field = (string) $field;
            if (!in_array($field, $allowed, true)) {
                $errors[$field] = sprintf(
                    'Unexpected field "%s". Only %s are accepted; totals and rates are always calculated by the server.',
                    $field,
                    implode(', ', $allowed),
                );
            }
        }

        return $errors;
    }

    /**
     * Rule: a known dealership is required (spec §3.2).
     *
     * @param array<array-key, mixed> $payload
     * @param array<string, string>   $errors
     */
    private function dealershipId(array $payload, array &$errors): ?string
    {
        $value = $payload['dealershipId'] ?? null;

        if ($value === null || $value === '') {
            $errors['dealershipId'] = 'Dealership is required.';

            return null;
        }

        if (!is_string($value)) {
            $errors['dealershipId'] = 'Dealership must be given as its identifier, e.g. "NGM".';

            return null;
        }

        if (!$this->dealerships->exists($value)) {
            $errors['dealershipId'] = sprintf('Unknown dealership "%s".', mb_substr($value, 0, 40));

            return null;
        }

        return $value;
    }

    /**
     * Rule: a real YYYY-MM month is required, and it cannot be in the future
     * (spec §3.2 "valid months"). The current month is allowed, so a
     * dealership can report as soon as the month is underway.
     *
     * @param array<array-key, mixed> $payload
     * @param array<string, string>   $errors
     */
    private function month(array $payload, array &$errors): ?Month
    {
        $value = $payload['month'] ?? null;

        if ($value === null || $value === '') {
            $errors['month'] = 'Month is required.';

            return null;
        }

        $month = Month::tryParse($value);
        if ($month === null) {
            $errors['month'] = 'Month must be in YYYY-MM format, e.g. 2026-03.';

            return null;
        }

        $current = Month::current($this->clock);
        if ($month->isAfter($current)) {
            $errors['month'] = sprintf(
                'Month cannot be in the future. The latest month you can report is %s.',
                $current->toString(),
            );

            return null;
        }

        return $month;
    }

    /**
     * Rule: counts are required, non-negative whole numbers (spec §3.2).
     *
     * Only true JSON integers pass. "5" (a string), 5.5 and even 5.0 are
     * rejected: json_decode turns 5.0 into a float, which shows the client is
     * not sending whole numbers. Strictness here keeps the stored data clean.
     *
     * @param array<array-key, mixed> $payload
     * @param array<string, string>   $errors
     */
    private function count(array $payload, string $field, string $label, array &$errors): ?int
    {
        $value = $payload[$field] ?? null;

        if ($value === null) {
            $errors[$field] = sprintf('%s is required.', $label);

            return null;
        }

        if (!is_int($value)) {
            $errors[$field] = sprintf('%s must be a whole number.', $label);

            return null;
        }

        if ($value < 0) {
            $errors[$field] = sprintf('%s cannot be negative.', $label);

            return null;
        }

        if ($value > self::MAX_COUNT) {
            $errors[$field] = sprintf('%s cannot be more than %s.', $label, number_format(self::MAX_COUNT));

            return null;
        }

        return $value;
    }

    /**
     * Rule: sales cannot exceed enquiries (spec §3.2).
     *
     * Sales are conversions of the same enquiries, so more sales than
     * enquiries is impossible. Only checked once both counts are valid, which
     * avoids piling a second, confusing error onto an already-invalid field.
     *
     * @param array<string, string> $errors
     */
    private function salesWithinEnquiries(?int $enquiries, ?int $sales, array &$errors): void
    {
        if ($enquiries !== null && $sales !== null && $sales > $enquiries) {
            $errors['sales'] = sprintf(
                'Sales (%d) cannot be more than enquiries (%d), because sales are conversions of those enquiries.',
                $sales,
                $enquiries,
            );
        }
    }

    /**
     * Rule: every correction must say why it was made (F8 audit trail).
     *
     * @param array<array-key, mixed> $payload
     * @param array<string, string>   $errors
     */
    private function reason(array $payload, array &$errors): ?string
    {
        $value = $payload['reason'] ?? null;

        if ($value !== null && !is_string($value)) {
            $errors['reason'] = 'Reason must be text.';

            return null;
        }

        $value = trim((string) $value);
        if ($value === '') {
            $errors['reason'] = 'A reason is required for every correction.';

            return null;
        }

        if (mb_strlen($value) > self::MAX_REASON_LENGTH) {
            $errors['reason'] = sprintf('Reason must be %d characters or fewer.', self::MAX_REASON_LENGTH);

            return null;
        }

        return $value;
    }
}
