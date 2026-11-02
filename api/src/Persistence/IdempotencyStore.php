<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

/**
 * Remembers which return each Idempotency-Key produced.
 *
 * The problem it solves (spec §4): a submission succeeds but the response is
 * lost, so the browser retries. Without this, the retry would get a 409
 * "duplicate" for a return the user never saw succeed, which is misleading
 * feedback. With it, the retry gets back the original 201.
 *
 * Production note: keys should expire (e.g. after 24 h). That is left out
 * here and listed in the README.
 *
 * @feature F7 Idempotent submission (spec §4 "Duplicate or concurrent submission")
 */
final class IdempotencyStore
{
    public function __construct(private readonly Database $db)
    {
    }

    /**
     * @return array{requestHash: string, returnId: int}|null
     */
    public function find(string $key): ?array
    {
        $statement = $this->db->pdo()->prepare(
            'SELECT request_hash, return_id FROM idempotency_keys WHERE key = :key',
        );
        $statement->execute(['key' => $key]);
        $row = $statement->fetch();

        return $row === false
            ? null
            : ['requestHash' => (string) $row['request_hash'], 'returnId' => (int) $row['return_id']];
    }

    public function remember(string $key, string $requestHash, int $returnId, string $now): void
    {
        $statement = $this->db->pdo()->prepare(<<<'SQL'
            INSERT INTO idempotency_keys (key, request_hash, return_id, created_at)
            VALUES (:key, :hash, :return_id, :now)
            SQL);
        $statement->execute(['key' => $key, 'hash' => $requestHash, 'return_id' => $returnId, 'now' => $now]);
    }
}
