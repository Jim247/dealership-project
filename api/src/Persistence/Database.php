<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

use PDO;
use RuntimeException;
use Throwable;

/**
 * SQLite connection and transaction handling.
 *
 * How SQLite affects concurrency and integrity (spec §5):
 *  - WAL journal mode lets readers carry on while one writer commits.
 *  - SQLite allows only one writer at a time. `busy_timeout` makes a second
 *    writer wait up to 5 s for the lock instead of failing at once.
 *  - Writes use `BEGIN IMMEDIATE`, which takes the write lock up front. Inside
 *    that transaction no other request can change the data, so a
 *    "check, then insert" sequence is race-free. The UNIQUE constraint stays
 *    as a backstop anyway.
 *  - Foreign keys are off by default in SQLite, so they are switched on for
 *    every connection.
 *
 * @feature F5 Race-safe duplicate rejection (spec §4 "Duplicate or concurrent submission")
 */
final class Database
{
    private function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Opens (and creates, if needed) the SQLite file at $path.
     */
    public static function open(string $path): self
    {
        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException(sprintf('Could not create database directory "%s".', $directory));
        }

        $pdo = new PDO('sqlite:' . $path, options: [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_STRINGIFY_FETCHES => false,
        ]);

        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('PRAGMA journal_mode = WAL');

        return new self($pdo);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    /**
     * Applies the schema. Every statement is idempotent, so this is safe to run on each boot.
     */
    public function migrate(string $schemaFile): void
    {
        $sql = file_get_contents($schemaFile);
        if ($sql === false) {
            throw new RuntimeException(sprintf('Could not read schema file "%s".', $schemaFile));
        }

        $this->pdo->exec($sql);
    }

    /**
     * Runs $work inside a write transaction that commits only if $work returns normally.
     *
     * @template T
     *
     * @param callable(): T $work
     *
     * @return T
     */
    public function transaction(callable $work): mixed
    {
        // IMMEDIATE takes the write lock now rather than at the first write,
        // so reads made inside $work cannot go stale before we write.
        $this->pdo->exec('BEGIN IMMEDIATE');

        try {
            $result = $work();
            $this->pdo->exec('COMMIT');

            return $result;
        } catch (Throwable $e) {
            $this->pdo->exec('ROLLBACK');

            throw $e;
        }
    }
}
