<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * A validated correction to an existing return's counts.
 *
 * The dealership and month are deliberately absent. They identify the return
 * and cannot be corrected: a wrong month is a different return.
 *
 * @feature F8 Corrections with audit trail (spec §4 "Access and audit history")
 */
final class CorrectionInput
{
    public function __construct(
        public readonly int $enquiries,
        public readonly int $sales,
        public readonly string $reason,
    ) {
    }
}
