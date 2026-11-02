<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * Read access to the known dealerships.
 *
 * The validator depends on this interface rather than on the database, so the
 * "known dealerships" rule (F4) can be unit tested with an in-memory list.
 */
interface DealershipLookup
{
    public function exists(string $id): bool;

    public function find(string $id): ?Dealership;

    /**
     * @return list<Dealership> ordered by name
     */
    public function all(): array;
}
