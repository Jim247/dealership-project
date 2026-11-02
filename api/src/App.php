<?php

declare(strict_types=1);

namespace Debonaire\Api;

use DateTimeImmutable;
use Debonaire\Api\Controller\DealershipsController;
use Debonaire\Api\Controller\ReturnsController;
use Debonaire\Api\Domain\AccessPolicy;
use Debonaire\Api\Domain\Clock;
use Debonaire\Api\Domain\Exception\AccessDenied;
use Debonaire\Api\Domain\Exception\DuplicateReturn;
use Debonaire\Api\Domain\Exception\IdempotencyKeyReused;
use Debonaire\Api\Domain\Exception\ReturnNotFound;
use Debonaire\Api\Domain\Exception\ValidationFailed;
use Debonaire\Api\Domain\FixedClock;
use Debonaire\Api\Domain\ReportCalculator;
use Debonaire\Api\Domain\ReturnValidator;
use Debonaire\Api\Domain\SystemClock;
use Debonaire\Api\Http\Cors;
use Debonaire\Api\Http\HttpError;
use Debonaire\Api\Http\JsonResponse;
use Debonaire\Api\Http\MockIdentity;
use Debonaire\Api\Http\Request;
use Debonaire\Api\Http\Router;
use Debonaire\Api\Persistence\AuditRepository;
use Debonaire\Api\Persistence\Database;
use Debonaire\Api\Persistence\DealershipRepository;
use Debonaire\Api\Persistence\IdempotencyStore;
use Debonaire\Api\Persistence\ReturnRepository;
use Debonaire\Api\Service\ReturnService;
use Throwable;

/**
 * Composition root: wires the API together and handles one request.
 *
 * Configuration (all optional, via environment variables):
 *   DEBONAIRE_DB               SQLite file path   (default: api/var/debonaire.sqlite)
 *   DEBONAIRE_ALLOWED_ORIGINS  comma-separated CORS origins
 *                              (default: http://localhost:3000,http://127.0.0.1:3000)
 *   DEBONAIRE_FIXED_NOW        freeze the clock, e.g. "2026-11-15T12:00:00Z" (tests only)
 */
final class App
{
    private function __construct(
        private readonly Router $router,
        private readonly Cors $cors,
    ) {
    }

    public static function fromEnvironment(): self
    {
        $root = dirname(__DIR__);

        $db = Database::open(self::env('DEBONAIRE_DB') ?? $root . '/var/debonaire.sqlite');
        $db->migrate($root . '/database/schema.sql');

        $fixedNow = self::env('DEBONAIRE_FIXED_NOW');
        $clock = $fixedNow === null ? new SystemClock() : new FixedClock(new DateTimeImmutable($fixedNow));

        $origins = array_values(array_filter(array_map(
            'trim',
            explode(',', self::env('DEBONAIRE_ALLOWED_ORIGINS') ?? 'http://localhost:3000,http://127.0.0.1:3000'),
        )));

        return self::build($db, $clock, $origins);
    }

    /**
     * Builds the object graph by hand. With this few classes a DI container
     * would add indirection without adding clarity.
     *
     * @param list<string> $allowedOrigins
     */
    public static function build(Database $db, Clock $clock, array $allowedOrigins): self
    {
        $dealerships = new DealershipRepository($db);
        $policy = new AccessPolicy();
        $identity = new MockIdentity($dealerships);

        $service = new ReturnService(
            db: $db,
            returns: new ReturnRepository($db),
            audit: new AuditRepository($db),
            idempotency: new IdempotencyStore($db),
            validator: new ReturnValidator($dealerships, $clock),
            policy: $policy,
            calculator: new ReportCalculator(),
            clock: $clock,
        );

        $returns = new ReturnsController($service, $identity);
        $dealershipsController = new DealershipsController($dealerships, $policy, $identity);

        $router = (new Router())
            ->add('GET', '/api/health', static fn (): JsonResponse => JsonResponse::ok(['status' => 'ok']))
            ->add('GET', '/api/dealerships', $dealershipsController->list(...))
            ->add('GET', '/api/returns', $returns->list(...))
            ->add('POST', '/api/returns', $returns->create(...))
            ->add('GET', '/api/returns/{id}', $returns->show(...))
            ->add('PUT', '/api/returns/{id}', $returns->correct(...))
            ->add('GET', '/api/returns/{id}/audit', $returns->audit(...));

        return new self($router, new Cors($allowedOrigins));
    }

    /**
     * Turns a request into a response. Never throws: every failure becomes JSON.
     */
    public function handle(Request $request): JsonResponse
    {
        if ($request->method === 'OPTIONS') {
            return $this->cors->preflight($request);
        }

        try {
            $response = $this->router->dispatch($request);
        } catch (Throwable $e) {
            $response = $this->errorResponse($e);
        }

        return $this->cors->apply($request, $response);
    }

    /**
     * The one place where failures become HTTP status codes.
     */
    private function errorResponse(Throwable $e): JsonResponse
    {
        return match (true) {
            $e instanceof HttpError => JsonResponse::error($e->status, $e->errorCode, $e->getMessage(), headers: $e->headers),
            $e instanceof ValidationFailed => JsonResponse::error(422, 'validation_failed', $e->getMessage(), $e->fields),
            $e instanceof IdempotencyKeyReused => JsonResponse::error(422, 'idempotency_key_reused', $e->getMessage()),
            $e instanceof AccessDenied => JsonResponse::error(403, 'forbidden', $e->getMessage()),
            $e instanceof ReturnNotFound => JsonResponse::error(404, 'not_found', $e->getMessage()),
            // F5: the existing return is included so a client can link to it or offer a correction.
            $e instanceof DuplicateReturn => JsonResponse::error(409, 'duplicate_return', $e->getMessage(), extra: [
                'existing' => $e->existing->toArray(),
            ]),
            default => self::internalError($e),
        };
    }

    /**
     * Logs unexpected failures in full on the server, and tells the client
     * nothing internal (no stack traces or SQL).
     */
    private static function internalError(Throwable $e): JsonResponse
    {
        error_log((string) $e);

        return JsonResponse::error(500, 'internal_error', 'Something went wrong on our side. Please try again.');
    }

    private static function env(string $name): ?string
    {
        $value = getenv($name);

        return $value === false || $value === '' ? null : $value;
    }
}
