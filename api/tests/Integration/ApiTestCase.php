<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

use Debonaire\Api\Persistence\AuditRepository;
use Debonaire\Api\Persistence\Database;
use Debonaire\Api\Persistence\Seeder;
use PHPUnit\Framework\TestCase;
use RuntimeException;

/**
 * Base class for HTTP-level tests against the real API.
 *
 * For each test class it starts `php -S` with the real front controller, a
 * throwaway SQLite file and a frozen clock (15 Nov 2026, so the current month
 * is 2026-11). Before each test it resets the data to the seed. Tests go
 * through real HTTP, routing, JSON, SQLite constraints and transactions, so
 * nothing is mocked.
 */
abstract class ApiTestCase extends TestCase
{
    protected const FIXED_NOW = '2026-11-15T12:00:00Z';
    protected const UI_ORIGIN = 'http://localhost:3000';

    /** @var resource|null */
    private static $server;
    private static string $baseUrl;
    private static string $tmpDir;
    private static string $dbPath;

    public static function setUpBeforeClass(): void
    {
        $apiRoot = dirname(__DIR__, 2);
        self::$tmpDir = sys_get_temp_dir() . '/debonaire-test-' . bin2hex(random_bytes(4));
        mkdir(self::$tmpDir);
        self::$dbPath = self::$tmpDir . '/test.sqlite';

        Database::open(self::$dbPath)->migrate($apiRoot . '/database/schema.sql');

        $port = self::freePort();
        self::$baseUrl = 'http://127.0.0.1:' . $port;

        $env = [
            'PATH' => (string) getenv('PATH'),
            'DEBONAIRE_DB' => self::$dbPath,
            'DEBONAIRE_FIXED_NOW' => self::FIXED_NOW,
            'DEBONAIRE_ALLOWED_ORIGINS' => self::UI_ORIGIN,
            // Several workers, so the concurrency test really runs requests in parallel.
            'PHP_CLI_SERVER_WORKERS' => '4',
        ];

        $process = proc_open(
            [PHP_BINARY, '-S', '127.0.0.1:' . $port, $apiRoot . '/public/index.php'],
            [0 => ['pipe', 'r'], 1 => ['file', '/dev/null', 'w'], 2 => ['file', self::$tmpDir . '/server.log', 'w']],
            $pipes,
            $apiRoot,
            $env,
        );

        if (!is_resource($process)) {
            throw new RuntimeException('Could not start the PHP built-in server.');
        }
        self::$server = $process;

        self::waitUntilHealthy();
    }

    public static function tearDownAfterClass(): void
    {
        if (is_resource(self::$server)) {
            $pid = proc_get_status(self::$server)['pid'];
            // The built-in server forks worker processes, so stop the children as well as the parent.
            exec(sprintf('pkill -TERM -P %d 2>/dev/null', $pid));
            proc_terminate(self::$server);
            proc_close(self::$server);
            self::$server = null;
        }

        foreach (glob(self::$tmpDir . '/*') ?: [] as $file) {
            unlink($file);
        }
        @rmdir(self::$tmpDir);
    }

    /**
     * Every test starts from exactly the seed data.
     */
    protected function setUp(): void
    {
        $db = Database::open(self::$dbPath);
        $db->pdo()->exec(
            'DELETE FROM idempotency_keys; DELETE FROM return_audit; DELETE FROM returns; '
            . 'DELETE FROM dealerships; DELETE FROM sqlite_sequence;',
        );
        (new Seeder($db, new AuditRepository($db)))->run();
    }

    // ---- Identity helpers (MOCK AUTH, F9) --------------------------------

    /** @return array<string, string> */
    protected static function asManager(): array
    {
        return ['X-Debonaire-Role' => 'manager'];
    }

    /** @return array<string, string> */
    protected static function asDealer(string $dealershipId): array
    {
        return ['X-Debonaire-Role' => 'dealer', 'X-Debonaire-Dealership' => $dealershipId];
    }

    // ---- HTTP helpers ------------------------------------------------------

    /**
     * @param array<string, string> $headers
     */
    protected function get(string $path, array $headers = ['X-Debonaire-Role' => 'manager']): ApiResponse
    {
        return $this->send('GET', $path, null, $headers);
    }

    /**
     * @param array<string, mixed>|string $body    arrays are JSON-encoded, strings sent raw
     * @param array<string, string>       $headers
     */
    protected function post(string $path, array|string $body, array $headers = ['X-Debonaire-Role' => 'manager']): ApiResponse
    {
        return $this->send('POST', $path, $body, $headers);
    }

    /**
     * @param array<string, mixed>|string $body
     * @param array<string, string>       $headers
     */
    protected function put(string $path, array|string $body, array $headers = ['X-Debonaire-Role' => 'manager']): ApiResponse
    {
        return $this->send('PUT', $path, $body, $headers);
    }

    /**
     * @param array<string, mixed>|string|null $body
     * @param array<string, string>            $headers
     */
    protected function send(string $method, string $path, array|string|null $body, array $headers): ApiResponse
    {
        $handle = self::curlHandle($method, $path, $body, $headers);
        $raw = curl_exec($handle);
        if ($raw === false) {
            throw new RuntimeException('HTTP request failed: ' . curl_error($handle));
        }

        return ApiResponse::fromCurl($handle, (string) $raw);
    }

    /**
     * Fires several identical requests at the same moment and returns every response.
     *
     * @param array<string, mixed>  $body
     * @param array<string, string> $headers
     *
     * @return list<ApiResponse>
     */
    protected function postConcurrently(string $path, array $body, int $count, array $headers = ['X-Debonaire-Role' => 'manager']): array
    {
        $multi = curl_multi_init();
        $handles = [];
        for ($i = 0; $i < $count; $i++) {
            $handles[] = $handle = self::curlHandle('POST', $path, $body, $headers);
            curl_multi_add_handle($multi, $handle);
        }

        do {
            $status = curl_multi_exec($multi, $running);
            if ($running > 0) {
                curl_multi_select($multi, 1.0);
            }
        } while ($running > 0 && $status === CURLM_OK);

        $responses = [];
        foreach ($handles as $handle) {
            $responses[] = ApiResponse::fromCurl($handle, (string) curl_multi_getcontent($handle));
            curl_multi_remove_handle($multi, $handle);
        }
        curl_multi_close($multi);

        return $responses;
    }

    /**
     * Direct read of the test database, to prove what was (or was not) stored.
     *
     * @param array<string, mixed> $params
     */
    protected function countRows(string $sql, array $params = []): int
    {
        $statement = Database::open(self::$dbPath)->pdo()->prepare($sql);
        $statement->execute($params);

        return (int) $statement->fetchColumn();
    }

    /**
     * Asserts the standard error envelope and returns its contents.
     *
     * @return array<string, mixed>
     */
    protected static function assertError(ApiResponse $response, int $status, string $code): array
    {
        self::assertSame($status, $response->status, 'Unexpected status. Body: ' . $response->raw);
        self::assertIsArray($response->json['error'] ?? null, 'Missing error envelope: ' . $response->raw);
        self::assertSame($code, $response->json['error']['code']);
        self::assertIsString($response->json['error']['message']);
        self::assertNotSame('', $response->json['error']['message']);

        return $response->json['error'];
    }

    // ---- Internals -----------------------------------------------------------

    /**
     * @param array<string, mixed>|string|null $body
     * @param array<string, string>            $headers
     *
     * @return \CurlHandle
     */
    private static function curlHandle(string $method, string $path, array|string|null $body, array $headers): \CurlHandle
    {
        $handle = curl_init(self::$baseUrl . $path);
        $headerLines = [];
        foreach ($headers as $name => $value) {
            $headerLines[] = $name . ': ' . $value;
        }

        if ($body !== null) {
            if (!array_key_exists('Content-Type', $headers)) {
                $headerLines[] = 'Content-Type: application/json';
            }
            curl_setopt($handle, CURLOPT_POSTFIELDS, is_array($body) ? json_encode($body, JSON_THROW_ON_ERROR) : $body);
        }

        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headerLines,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADER => true,
            CURLOPT_TIMEOUT => 15,
        ]);

        return $handle;
    }

    private static function freePort(): int
    {
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        if ($socket === false) {
            throw new RuntimeException('Could not find a free port.');
        }
        $name = (string) stream_socket_get_name($socket, false);
        fclose($socket);

        return (int) substr($name, strrpos($name, ':') + 1);
    }

    private static function waitUntilHealthy(): void
    {
        $deadline = microtime(true) + 10;
        while (microtime(true) < $deadline) {
            $handle = curl_init(self::$baseUrl . '/api/health');
            curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 1]);
            if (curl_exec($handle) !== false && curl_getinfo($handle, CURLINFO_RESPONSE_CODE) === 200) {
                return;
            }
            usleep(100_000);
        }

        throw new RuntimeException('API did not start. Server log: ' . @file_get_contents(self::$tmpDir . '/server.log'));
    }
}
