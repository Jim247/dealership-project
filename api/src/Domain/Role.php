<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

/**
 * Who is making a request.
 *
 * @feature F9 Mock access control (spec §4 "Access and audit history")
 */
enum Role: string
{
    /** Works at one dealership. Submits and views only that dealership's returns. */
    case Dealer = 'dealer';

    /** Reviews every dealership. The only role allowed to correct a return. */
    case Manager = 'manager';
}
