<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

use JsonException;

/**
 * Append-only history of every change to a return.
 *
 * Rows are only ever inserted, never updated or deleted, so the history of a
 * return can always be replayed: who changed what, from what, to what, and why.
 *
 * @feature F8 Corrections with audit trail (spec §4 "Access and audit history")
 */
final class AuditRepository
{
    public const ACTION_CREATED = 'created';
    public const ACTION_CORRECTED = 'corrected';

    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @param string                                       $actorRole 'dealer', 'manager' or 'seed'
     * @param array{enquiries: int, sales: int}|null       $before    null for 'created'
     * @param array{enquiries: int, sales: int}            $after
     *
     * @throws JsonException
     */
    public function record(
        int $returnId,
        string $action,
        string $actorRole,
        ?string $actorDealershipId,
        ?array $before,
        array $after,
        ?string $reason,
        string $now,
    ): void {
        $statement = $this->db->pdo()->prepare(<<<'SQL'
            INSERT INTO return_audit
                (return_id, action, actor_role, actor_dealership_id, before_json, after_json, reason, created_at)
            VALUES (:return_id, :action, :role, :dealership, :before, :after, :reason, :now)
            SQL);

        $statement->execute([
            'return_id' => $returnId,
            'action' => $action,
            'role' => $actorRole,
            'dealership' => $actorDealershipId,
            'before' => $before === null ? null : json_encode($before, JSON_THROW_ON_ERROR),
            'after' => json_encode($after, JSON_THROW_ON_ERROR),
            'reason' => $reason,
            'now' => $now,
        ]);
    }

    /**
     * History for one return, oldest first.
     *
     * @return list<array<string, mixed>> API-ready entries
     *
     * @throws JsonException
     */
    public function forReturn(int $returnId): array
    {
        $statement = $this->db->pdo()->prepare(
            'SELECT * FROM return_audit WHERE return_id = :id ORDER BY id ASC',
        );
        $statement->execute(['id' => $returnId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'action' => $row['action'],
            'actorRole' => $row['actor_role'],
            'actorDealershipId' => $row['actor_dealership_id'],
            'before' => $row['before_json'] === null ? null : json_decode($row['before_json'], true, 4, JSON_THROW_ON_ERROR),
            'after' => json_decode($row['after_json'], true, 4, JSON_THROW_ON_ERROR),
            'reason' => $row['reason'],
            'createdAt' => $row['created_at'],
        ], $statement->fetchAll());
    }
}
