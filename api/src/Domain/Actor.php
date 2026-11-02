<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use InvalidArgumentException;

/**
 * The identity behind a request: a role, plus the dealership for dealers.
 *
 * MOCK AUTH (F9): in this exercise an Actor is built from request headers. In
 * production it would come from a verified session or token, never from
 * anything the client can simply assert.
 *
 * @feature F9 Mock access control (spec §4 "Access and audit history")
 */
final class Actor
{
    private function __construct(
        public readonly Role $role,
        public readonly ?string $dealershipId,
    ) {
    }

    public static function manager(): self
    {
        return new self(Role::Manager, null);
    }

    public static function dealer(string $dealershipId): self
    {
        if ($dealershipId === '') {
            throw new InvalidArgumentException('A dealer must belong to a dealership.');
        }

        return new self(Role::Dealer, $dealershipId);
    }

    public function isManager(): bool
    {
        return $this->role === Role::Manager;
    }

    /**
     * True when this actor is a dealer at the given dealership.
     */
    public function worksAt(string $dealershipId): bool
    {
        return $this->role === Role::Dealer && $this->dealershipId === $dealershipId;
    }
}
