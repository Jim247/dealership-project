<?php

declare(strict_types=1);

namespace Debonaire\Api\Service;

use Debonaire\Api\Domain\AccessPolicy;
use Debonaire\Api\Domain\Actor;
use Debonaire\Api\Domain\Clock;
use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Domain\Exception\AccessDenied;
use Debonaire\Api\Domain\Exception\DuplicateReturn;
use Debonaire\Api\Domain\Exception\IdempotencyKeyReused;
use Debonaire\Api\Domain\Exception\ReturnNotFound;
use Debonaire\Api\Domain\Exception\ValidationFailed;
use Debonaire\Api\Domain\ReportCalculator;
use Debonaire\Api\Domain\ReportResult;
use Debonaire\Api\Domain\ReturnValidator;
use Debonaire\Api\Domain\SubmitResult;
use Debonaire\Api\Persistence\AuditRepository;
use Debonaire\Api\Persistence\Database;
use Debonaire\Api\Persistence\IdempotencyStore;
use Debonaire\Api\Persistence\ReturnRepository;

/**
 * The use cases for dealership returns: list, view, submit, correct and audit.
 *
 * Each method follows the same order:
 *   1. validate the input        (ReturnValidator: never trust the client)
 *   2. check access               (AccessPolicy: one place for every rule)
 *   3. do the work, in a transaction where it writes
 *
 * Controllers stay thin (HTTP in, JSON out) and all business behaviour lives here.
 *
 * @feature F2 Save a return            (spec §3.2)
 * @feature F3 Retrieve returns         (spec §3.2, §3.3)
 * @feature F5 Duplicate rejection      (spec §3.2, §4)
 * @feature F6 Totals                   (spec §3.3, §3.4)
 * @feature F7 Idempotent submission    (spec §4)
 * @feature F8 Corrections + audit      (spec §4)
 * @feature F9 Mock access control      (spec §4)
 */
final class ReturnService
{
    public function __construct(
        private readonly Database $db,
        private readonly ReturnRepository $returns,
        private readonly AuditRepository $audit,
        private readonly IdempotencyStore $idempotency,
        private readonly ReturnValidator $validator,
        private readonly AccessPolicy $policy,
        private readonly ReportCalculator $calculator,
        private readonly Clock $clock,
    ) {
    }

    /**
     * Returns matching a filter, with server-calculated totals for exactly those rows.
     *
     * @param array<array-key, mixed> $query raw query-string values
     *
     * @throws ValidationFailed for a malformed filter
     * @throws AccessDenied     when a dealer asks for another dealership
     */
    public function list(Actor $actor, array $query): ReportResult
    {
        $filter = $this->policy->scopeFilter($actor, $this->validator->validateFilter($query));
        $rows = $this->returns->search($filter);

        // Totals come from the very same rows the table shows (spec §4
        // "Reporting consistency"), so the two can never drift apart.
        return new ReportResult($rows, $this->calculator->totals($rows), $filter);
    }

    /**
     * @throws ReturnNotFound
     * @throws AccessDenied
     */
    public function get(Actor $actor, int $id): DealershipReturn
    {
        $return = $this->returns->find($id) ?? throw new ReturnNotFound($id);
        $this->policy->assertCanView($actor, $return);

        return $return;
    }

    /**
     * Saves a new return.
     *
     * Two protections against duplicates (spec §4):
     *  - Same dealership + month: rejected with DuplicateReturn (409). The
     *    check runs under BEGIN IMMEDIATE and is backed by a UNIQUE
     *    constraint, so concurrent requests cannot both succeed.
     *  - Same Idempotency-Key (a retry of one submission): the original
     *    result is replayed, so a lost response does not turn into a
     *    misleading "duplicate" error.
     *
     * @param array<array-key, mixed> $payload        decoded JSON body
     * @param string|null             $idempotencyKey from the Idempotency-Key header
     *
     * @throws ValidationFailed
     * @throws AccessDenied
     * @throws DuplicateReturn
     * @throws IdempotencyKeyReused
     */
    public function submit(Actor $actor, array $payload, ?string $idempotencyKey): SubmitResult
    {
        $input = $this->validator->validateNewReturn($payload);
        $this->policy->assertCanSubmitFor($actor, $input->dealershipId);

        // Fingerprint who sent what, so a reused key with different data is caught.
        $requestHash = hash('sha256', json_encode([
            'role' => $actor->role->value,
            'actorDealershipId' => $actor->dealershipId,
            'return' => $input->toCanonicalArray(),
        ], JSON_THROW_ON_ERROR));

        return $this->db->transaction(function () use ($actor, $input, $idempotencyKey, $requestHash): SubmitResult {
            if ($idempotencyKey !== null) {
                $previous = $this->idempotency->find($idempotencyKey);

                if ($previous !== null) {
                    if (!hash_equals($previous['requestHash'], $requestHash)) {
                        throw new IdempotencyKeyReused();
                    }

                    // A retry of a request that already succeeded: hand back
                    // the original return rather than an error.
                    $original = $this->returns->find($previous['returnId']) ?? throw new ReturnNotFound($previous['returnId']);

                    return new SubmitResult($original, replayed: true);
                }
            }

            // Inside BEGIN IMMEDIATE no other writer can slip in between this
            // check and the insert below.
            $existing = $this->returns->findByDealershipAndMonth($input->dealershipId, $input->month->toString());
            if ($existing !== null) {
                throw new DuplicateReturn($existing);
            }

            $now = $this->now();
            $id = $this->returns->insert($input, $now);

            $this->audit->record(
                $id,
                AuditRepository::ACTION_CREATED,
                $actor->role->value,
                $actor->dealershipId,
                null,
                ['enquiries' => $input->enquiries, 'sales' => $input->sales],
                null,
                $now,
            );

            if ($idempotencyKey !== null) {
                $this->idempotency->remember($idempotencyKey, $requestHash, $id, $now);
            }

            $created = $this->returns->find($id) ?? throw new ReturnNotFound($id);

            return new SubmitResult($created, replayed: false);
        });
    }

    /**
     * Corrects a return's counts and records why, in one transaction.
     *
     * The update and its audit entry either both commit or neither does, so
     * the history can never miss a change.
     *
     * @param array<array-key, mixed> $payload decoded JSON body
     *
     * @throws AccessDenied     unless the actor is a manager
     * @throws ValidationFailed for invalid counts/reason, or when nothing would change
     * @throws ReturnNotFound
     */
    public function correct(Actor $actor, int $id, array $payload): DealershipReturn
    {
        $this->policy->assertCanCorrect($actor);
        $input = $this->validator->validateCorrection($payload);

        return $this->db->transaction(function () use ($actor, $id, $input): DealershipReturn {
            $before = $this->returns->find($id) ?? throw new ReturnNotFound($id);

            // A "correction" that changes nothing would only add noise to the audit trail.
            if ($before->enquiries === $input->enquiries && $before->sales === $input->sales) {
                throw new ValidationFailed(
                    ['enquiries' => 'These figures match the current return, so there is nothing to correct.'],
                    'The correction could not be saved. Please fix the highlighted fields.',
                );
            }

            $now = $this->now();
            $this->returns->updateCounts($id, $input->enquiries, $input->sales, $now);

            $this->audit->record(
                $id,
                AuditRepository::ACTION_CORRECTED,
                $actor->role->value,
                $actor->dealershipId,
                ['enquiries' => $before->enquiries, 'sales' => $before->sales],
                ['enquiries' => $input->enquiries, 'sales' => $input->sales],
                $input->reason,
                $now,
            );

            return $this->returns->find($id) ?? throw new ReturnNotFound($id);
        });
    }

    /**
     * Full change history of one return, oldest first.
     *
     * @return list<array<string, mixed>>
     *
     * @throws AccessDenied unless the actor is a manager
     * @throws ReturnNotFound
     */
    public function history(Actor $actor, int $id): array
    {
        $this->policy->assertCanViewAudit($actor);
        $this->returns->find($id) ?? throw new ReturnNotFound($id);

        return $this->audit->forReturn($id);
    }

    /**
     * Current time as ISO-8601 UTC, the format used for every stored timestamp.
     */
    private function now(): string
    {
        return $this->clock->now()->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d\TH:i:s\Z');
    }
}
