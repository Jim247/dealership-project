<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

use RuntimeException;

/**
 * A protocol-level failure (bad JSON, wrong content type, missing identity,
 * unknown route) that is not a business rule. It carries its own HTTP status.
 */
final class HttpError extends RuntimeException
{
    /**
     * @param array<string, string> $headers extra response headers, e.g. Allow for a 405
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }
}
