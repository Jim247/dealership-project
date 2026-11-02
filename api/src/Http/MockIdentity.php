<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

use Debonaire\Api\Domain\Actor;
use Debonaire\Api\Domain\DealershipLookup;
use Debonaire\Api\Domain\Role;

/**
 * Works out who is calling from two demo headers:
 *
 *     X-Debonaire-Role:       dealer | manager
 *     X-Debonaire-Dealership: NGM            (required for dealers)
 *
 * MOCK AUTH (F9): THIS IS NOT AUTHENTICATION. Any client can send any header.
 * It exists so the access rules in AccessPolicy can be demonstrated and
 * tested. In production this class would be replaced by verifying a session
 * cookie or a signed token (e.g. an SSO-issued JWT), with the role and
 * dealership taken from the verified claims.
 *
 * Missing or invalid headers give a 401 rather than a default role. The API
 * fails closed.
 *
 * @feature F9 Mock access control (spec §4 "Access and audit history")
 */
final class MockIdentity
{
    public function __construct(private readonly DealershipLookup $dealerships)
    {
    }

    /**
     * @throws HttpError 401 when the identity headers are missing or invalid
     */
    public function resolve(Request $request): Actor
    {
        $role = Role::tryFrom(strtolower(trim($request->header('x-debonaire-role') ?? '')));

        if ($role === null) {
            throw new HttpError(
                401,
                'missing_identity',
                'Send X-Debonaire-Role: dealer or manager. (This demo uses mock identity headers instead of real authentication.)',
            );
        }

        if ($role === Role::Manager) {
            return Actor::manager();
        }

        $dealershipId = trim($request->header('x-debonaire-dealership') ?? '');
        if ($dealershipId === '' || !$this->dealerships->exists($dealershipId)) {
            throw new HttpError(
                401,
                'missing_identity',
                'Dealer requests must include X-Debonaire-Dealership with a known dealership id.',
            );
        }

        return Actor::dealer($dealershipId);
    }
}
