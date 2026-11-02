<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

use Debonaire\Api\Domain\Dealership;
use Debonaire\Api\Domain\DealershipLookup;

/**
 * Reads the fictional dealerships from SQLite.
 *
 * @feature F1 Dealership data (spec §3.1)
 * @feature F4 "Known dealerships" validation (spec §3.2)
 */
final class DealershipRepository implements DealershipLookup
{
    public function __construct(private readonly Database $db)
    {
    }

    public function exists(string $id): bool
    {
        return $this->find($id) !== null;
    }

    public function find(string $id): ?Dealership
    {
        $statement = $this->db->pdo()->prepare('SELECT id, name FROM dealerships WHERE id = :id');
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : new Dealership($row['id'], $row['name']);
    }

    public function all(): array
    {
        $rows = $this->db->pdo()->query('SELECT id, name FROM dealerships ORDER BY name')->fetchAll();

        return array_map(static fn (array $row): Dealership => new Dealership($row['id'], $row['name']), $rows);
    }
}
