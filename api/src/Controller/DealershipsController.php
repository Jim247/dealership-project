<?php

declare(strict_types=1);

namespace Debonaire\Api\Controller;

use Debonaire\Api\Domain\AccessPolicy;
use Debonaire\Api\Domain\Dealership;
use Debonaire\Api\Domain\DealershipLookup;
use Debonaire\Api\Http\JsonResponse;
use Debonaire\Api\Http\MockIdentity;
use Debonaire\Api\Http\Request;

/**
 * GET /api/dealerships: the dealerships the caller may see.
 *
 * Feeds the form's dropdown. A dealer only ever sees their own dealership.
 *
 * @feature F1 Dealership data (spec §3.1)
 * @feature F9 Mock access control (spec §4)
 */
final class DealershipsController
{
    public function __construct(
        private readonly DealershipLookup $dealerships,
        private readonly AccessPolicy $policy,
        private readonly MockIdentity $identity,
    ) {
    }

    /**
     * @param array<string, string> $params
     */
    public function list(Request $request, array $params): JsonResponse
    {
        $visible = $this->policy->visibleDealerships($this->identity->resolve($request), $this->dealerships->all());

        return JsonResponse::ok([
            'data' => array_map(static fn (Dealership $d): array => $d->toArray(), $visible),
        ]);
    }
}
