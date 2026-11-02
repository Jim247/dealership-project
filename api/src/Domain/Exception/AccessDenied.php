<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

/**
 * The actor is identified but not allowed to do this. Mapped to HTTP 403.
 *
 * @feature F9 Mock access control (spec §4 "Access and audit history")
 */
final class AccessDenied extends DomainError
{
}
