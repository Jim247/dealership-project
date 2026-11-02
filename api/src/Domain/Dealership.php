<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * A fictional dealership that submits monthly returns.
 *
 * @feature F1 Dealership data (spec §3.1)
 */
final class Dealership
{
    public function __construct(
        public readonly string $id,
        public readonly string $name,
    ) {
    }

    /**
     * @return array{id: string, name: string}
     */
    public function toArray(): array
    {
        return ['id' => $this->id, 'name' => $this->name];
    }
}
