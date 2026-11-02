<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * A captured HTTP response: status, lower-cased headers and decoded JSON.
 */
final class ApiResponse
{
    /**
     * @param array<string, string>     $headers
     * @param array<string, mixed>|null $json
     */
    private function __construct(
        public readonly int $status,
        public readonly array $headers,
        public readonly ?array $json,
        public readonly string $raw,
    ) {
    }

    public static function fromCurl(\CurlHandle $handle, string $response): self
    {
        $headerSize = (int) curl_getinfo($handle, CURLINFO_HEADER_SIZE);
        $headerBlock = substr($response, 0, $headerSize);
        $body = substr($response, $headerSize);

        $headers = [];
        foreach (explode("\r\n", $headerBlock) as $line) {
            if (str_contains($line, ':')) {
                [$name, $value] = explode(':', $line, 2);
                $headers[strtolower(trim($name))] = trim($value);
            }
        }

        $json = $body === '' ? null : json_decode($body, true);

        return new self(
            (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE),
            $headers,
            is_array($json) ? $json : null,
            $body,
        );
    }

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }
}
