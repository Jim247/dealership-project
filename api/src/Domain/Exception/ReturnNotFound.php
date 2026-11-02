<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

/**
 * No return exists with the requested id. Mapped to HTTP 404.
 *
 * @feature F3 Retrieve returns (spec §3.2)
 */
final class ReturnNotFound extends DomainError
{
    public function __construct(int $id)
    {
        parent::__construct(sprintf('Return %d was not found.', $id));
    }
}
