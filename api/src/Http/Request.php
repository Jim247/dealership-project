<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

use JsonException;

/**
 * An immutable view of the incoming HTTP request.
 *
 * Built from PHP's globals once, in the front controller. Everything after
 * that works on this object, which keeps the rest of the code free of
 * superglobals and easy to test.
 */
final class Request
{
    /** Request bodies are tiny JSON objects. Anything larger is refused. */
    private const MAX_BODY_BYTES = 16_384;

    /**
     * @param array<array-key, mixed> $query
     * @param array<string, string>   $headers keys are lower-case
     */
    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        private readonly array $headers,
        public readonly string $body,
    ) {
    }

    public static function fromGlobals(): self
    {
        $headers = [];
        foreach ($_SERVER as $key => $value) {
            if (str_starts_with((string) $key, 'HTTP_')) {
                $headers[strtolower(str_replace('_', '-', substr((string) $key, 5)))] = (string) $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['content-type'] = (string) $_SERVER['CONTENT_TYPE'];
        }

        $path = parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);

        return new self(
            method: strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET')),
            path: is_string($path) ? $path : '/',
            query: $_GET,
            headers: $headers,
            body: (string) file_get_contents('php://input'),
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }

    /**
     * Decodes the body, which must be a single JSON object.
     *
     * @return array<array-key, mixed>
     *
     * @throws HttpError 415 for a non-JSON content type, 413 if too large, 400 for malformed JSON or a non-object
     */
    public function jsonObject(): array
    {
        $contentType = strtolower(trim(explode(';', $this->header('content-type') ?? '')[0]));
        if ($contentType !== 'application/json') {
            throw new HttpError(415, 'unsupported_media_type', 'Send the request body as JSON with Content-Type: application/json.');
        }

        if (strlen($this->body) > self::MAX_BODY_BYTES) {
            throw new HttpError(413, 'payload_too_large', 'The request body is too large.');
        }

        try {
            // Decode objects as stdClass first, so we can tell {"a":1} (an
            // object) from [1] (a list). Associative decoding would make both arrays.
            $decoded = json_decode($this->body, false, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
        }

        if (!$decoded instanceof \stdClass) {
            throw new HttpError(400, 'invalid_json', 'The request body must be a JSON object.');
        }

        return get_object_vars($decoded);
    }
}
