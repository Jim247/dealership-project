<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

use RuntimeException;

/**
 * Base class for the business-rule failures a client can cause.
 *
 * The domain throws these without knowing about HTTP. App::errorResponse()
 * is the single place that maps each one to a status code.
 */
abstract class DomainError extends RuntimeException
{
}
