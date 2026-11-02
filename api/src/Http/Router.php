<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

/**
 * A minimal method + path router.
 *
 * Paths may contain `{id}` placeholders, which match positive integers only,
 * so a malformed id such as "/api/returns/abc" is a 404, never a query.
 */
final class Router
{
    /** @var list<array{method: string, regex: string, handler: callable(Request, array<string, string>): JsonResponse}> */
    private array $routes = [];

    /**
     * @param callable(Request, array<string, string>): JsonResponse $handler
     */
    public function add(string $method, string $pattern, callable $handler): self
    {
        $regex = '#^' . preg_replace('/\{(\w+)\}/', '(?P<$1>[1-9][0-9]{0,17})', $pattern) . '$#';
        $this->routes[] = ['method' => strtoupper($method), 'regex' => $regex, 'handler' => $handler];

        return $this;
    }

    /**
     * @throws HttpError 404 when no route matches the path, 405 when the path exists for other methods
     */
    public function dispatch(Request $request): JsonResponse
    {
        $path = $request->path === '/' ? '/' : rtrim($request->path, '/');
        $allowed = [];

        foreach ($this->routes as $route) {
            if (preg_match($route['regex'], $path, $matches) !== 1) {
                continue;
            }

            if ($route['method'] !== $request->method) {
                $allowed[] = $route['method'];
                continue;
            }

            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);

            return ($route['handler'])($request, $params);
        }

        if ($allowed !== []) {
            throw new HttpError(
                405,
                'method_not_allowed',
                sprintf('%s is not supported here. Allowed: %s.', $request->method, implode(', ', $allowed)),
                ['Allow' => implode(', ', $allowed)],
            );
        }

        throw new HttpError(404, 'not_found', 'No endpoint matches this path.');
    }
}
