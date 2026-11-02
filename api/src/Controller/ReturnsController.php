<?php

declare(strict_types=1);

namespace Debonaire\Api\Controller;

use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Http\HttpError;
use Debonaire\Api\Http\JsonResponse;
use Debonaire\Api\Http\MockIdentity;
use Debonaire\Api\Http\Request;
use Debonaire\Api\Service\ReturnService;

/**
 * HTTP endpoints for dealership returns.
 *
 *   GET  /api/returns?from=YYYY-MM&to=YYYY-MM&dealershipId=NGM   list + totals   (F3, F6)
 *   GET  /api/returns/{id}                                       one return      (F3)
 *   POST /api/returns                                            submit          (F2, F4, F5, F7)
 *   PUT  /api/returns/{id}                                       correct         (F8, manager only)
 *   GET  /api/returns/{id}/audit                                 history         (F8, manager only)
 *
 * This class only translates between HTTP and ReturnService. Business rules
 * live in the service and domain. Errors are thrown and turned into JSON by App.
 */
final class ReturnsController
{
    /**
     * Idempotency keys are opaque client-generated tokens. UUIDs fit, and the
     * limit keeps junk out of the database.
     */
    private const IDEMPOTENCY_KEY_PATTERN = '/^[A-Za-z0-9_-]{8,128}\z/';

    public function __construct(
        private readonly ReturnService $service,
        private readonly MockIdentity $identity,
    ) {
    }

    /**
     * Lists returns with server-calculated totals for the same filter.
     *
     * @param array<string, string> $params
     */
    public function list(Request $request, array $params): JsonResponse
    {
        $result = $this->service->list($this->identity->resolve($request), $request->query);

        return JsonResponse::ok([
            'data' => array_map(static fn (DealershipReturn $r): array => $r->toArray(), $result->returns),
            'totals' => $result->totals->toArray(),
            // Echo the filter actually applied (a dealer's is forced to their
            // own dealership) so the client can label the totals correctly.
            'filter' => $result->filter->toArray(),
        ]);
    }

    /**
     * @param array<string, string> $params
     */
    public function show(Request $request, array $params): JsonResponse
    {
        $return = $this->service->get($this->identity->resolve($request), (int) $params['id']);

        return JsonResponse::ok(['data' => $return->toArray()]);
    }

    /**
     * Submits a new return. Returns 201 with a Location header.
     *
     * When the Idempotency-Key matches an earlier successful request, the
     * original return comes back with `Idempotent-Replayed: true` and nothing
     * new is stored.
     *
     * @param array<string, string> $params
     */
    public function create(Request $request, array $params): JsonResponse
    {
        $actor = $this->identity->resolve($request);
        $result = $this->service->submit($actor, $request->jsonObject(), $this->idempotencyKey($request));

        $headers = ['Location' => '/api/returns/' . $result->return->id];
        if ($result->replayed) {
            $headers['Idempotent-Replayed'] = 'true';
        }

        return JsonResponse::ok(['data' => $result->return->toArray()], 201, $headers);
    }

    /**
     * Corrects a return's counts (manager only). The reason is stored in the audit trail.
     *
     * @param array<string, string> $params
     */
    public function correct(Request $request, array $params): JsonResponse
    {
        $actor = $this->identity->resolve($request);
        $return = $this->service->correct($actor, (int) $params['id'], $request->jsonObject());

        return JsonResponse::ok(['data' => $return->toArray()]);
    }

    /**
     * @param array<string, string> $params
     */
    public function audit(Request $request, array $params): JsonResponse
    {
        $entries = $this->service->history($this->identity->resolve($request), (int) $params['id']);

        return JsonResponse::ok(['data' => $entries]);
    }

    /**
     * @throws HttpError 400 when the header is present but malformed
     */
    private function idempotencyKey(Request $request): ?string
    {
        $key = $request->header('idempotency-key');

        if ($key === null || $key === '') {
            return null;
        }

        if (preg_match(self::IDEMPOTENCY_KEY_PATTERN, $key) !== 1) {
            throw new HttpError(
                400,
                'invalid_idempotency_key',
                'Idempotency-Key must be 8–128 characters of letters, digits, "-" or "_" (a UUID works).',
            );
        }

        return $key;
    }
}
