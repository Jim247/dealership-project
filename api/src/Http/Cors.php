<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

/**
 * Cross-origin rules for the browser UI.
 *
 * The Next.js page (port 3000) calls this API (port 8000) directly from the
 * browser, so the browser needs explicit permission. Only the configured
 * origins are allowed. Other sites cannot read responses or send the custom
 * identity headers.
 */
final class Cors
{
    private const ALLOWED_HEADERS = 'Content-Type, Idempotency-Key, X-Debonaire-Role, X-Debonaire-Dealership';
    private const EXPOSED_HEADERS = 'Location, Idempotent-Replayed';

    /**
     * @param list<string> $allowedOrigins e.g. ['http://localhost:3000']
     */
    public function __construct(private readonly array $allowedOrigins)
    {
    }

    /**
     * Answers a CORS preflight (OPTIONS) without touching any business logic.
     */
    public function preflight(Request $request): JsonResponse
    {
        return $this->apply($request, JsonResponse::noContent())->withHeaders([
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers' => self::ALLOWED_HEADERS,
            'Access-Control-Max-Age' => '600',
        ]);
    }

    /**
     * Adds the CORS headers to a response when the caller's origin is allowed.
     */
    public function apply(Request $request, JsonResponse $response): JsonResponse
    {
        $origin = $request->header('origin');

        $headers = ['Vary' => 'Origin'];
        if ($origin !== null && in_array($origin, $this->allowedOrigins, true)) {
            $headers['Access-Control-Allow-Origin'] = $origin;
            $headers['Access-Control-Expose-Headers'] = self::EXPOSED_HEADERS;
        }

        return $response->withHeaders($headers);
    }
}
