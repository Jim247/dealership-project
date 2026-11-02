<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain\Exception;

/**
 * One or more fields broke a validation rule. Mapped to HTTP 422.
 *
 * @feature F4 Server-side validation (spec §3.2)
 */
final class ValidationFailed extends DomainError
{
    /**
     * @param array<string, string> $fields one human-readable message per offending field
     */
    public function __construct(
        public readonly array $fields,
        string $message = 'The return could not be saved. Please fix the highlighted fields.',
    ) {
        parent::__construct($message);
    }
}
