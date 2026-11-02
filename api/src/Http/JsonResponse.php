<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

/**
 * A JSON HTTP response.
 *
 * Every error the API returns has the same envelope, so clients only need one
 * parser:
 *
 *     { "error": { "code": "validation_failed", "message": "…", "fields": { "sales": "…" } } }
 */
final class JsonResponse
{
    /**
     * @param array<string, mixed>|null $body    null for an empty body (204)
     * @param array<string, string>     $headers
     */
    public function __construct(
        public readonly int $status,
        public readonly ?array $body,
        public readonly array $headers = [],
    ) {
    }

    /**
     * @param array<string, mixed>  $body
     * @param array<string, string> $headers
     */
    public static function ok(array $body, int $status = 200, array $headers = []): self
    {
        return new self($status, $body, $headers);
    }

    public static function noContent(): self
    {
        return new self(204, null);
    }

    /**
     * @param array<string, string> $fields  per-field messages, only for field-level problems
     * @param array<string, mixed>  $extra   extra machine-readable context, e.g. the existing return on a 409
     * @param array<string, string> $headers
     */
    public static function error(
        int $status,
        string $code,
        string $message,
        array $fields = [],
        array $extra = [],
        array $headers = [],
    ): self {
        $error = ['code' => $code, 'message' => $message];
        if ($fields !== []) {
            $error['fields'] = $fields;
        }

        return new self($status, ['error' => $error + $extra], $headers);
    }

    /**
     * @param array<string, string> $headers
     */
    public function withHeaders(array $headers): self
    {
        return new self($this->status, $this->body, $headers + $this->headers);
    }

    /**
     * Writes the response to the client. Called once, by the front controller.
     */
    public function send(): void
    {
        http_response_code($this->status);

        $headers = $this->headers + [
            'Cache-Control' => 'no-store',
            'X-Content-Type-Options' => 'nosniff',
        ];
        if ($this->body !== null) {
            $headers['Content-Type'] = 'application/json; charset=utf-8';
        }

        foreach ($headers as $name => $value) {
            header($name . ': ' . $value);
        }

        if ($this->body !== null) {
            // PRESERVE_ZERO_FRACTION keeps rates typed consistently: 25% is sent as 25.0, not
            // the integer 25, so `conversionRate` is always a decimal number (or null).
            echo json_encode(
                $this->body,
                JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR,
            );
        }
    }
}
