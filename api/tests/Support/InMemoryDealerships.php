<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Support;

use Debonaire\Api\Domain\Dealership;
use Debonaire\Api\Domain\DealershipLookup;

/**
 * A fixed list of dealerships, so unit tests need no database.
 */
final class InMemoryDealerships implements DealershipLookup
{
    /** @var array<string, Dealership> */
    private array $byId = [];

    /**
     * @param array<string, string> $dealerships id => name
     */
    public function __construct(array $dealerships = ['NGM' => 'Northgate Motors', 'HBC' => 'Harbour Cars'])
    {
        foreach ($dealerships as $id => $name) {
            $this->byId[$id] = new Dealership($id, $name);
        }
    }

    public function exists(string $id): bool
    {
        return isset($this->byId[$id]);
    }

    public function find(string $id): ?Dealership
    {
        return $this->byId[$id] ?? null;
    }

    public function all(): array
    {
        return array_values($this->byId);
    }
}
