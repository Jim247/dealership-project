<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Unit;

use Debonaire\Api\Http\AccessCode;
use Debonaire\Api\Http\HttpError;
use Debonaire\Api\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Covers F15, the public demo's shared access code: off when no code is
 * configured, and otherwise only an exact Bearer match gets through.
 */
final class AccessCodeTest extends TestCase
{
    private const CODE = 'c0ffee-demo-code-42';

    public function test_no_configured_code_lets_every_request_through(): void
    {
        $gate = new AccessCode(null);

        self::assertFalse($gate->isRequired());
        $gate->check(self::request([]));
        $gate->check(self::request(['authorization' => 'Bearer anything']));
        $this->addToAssertionCount(2);
    }

    public function test_the_right_code_gets_through(): void
    {
        $gate = new AccessCode(self::CODE);

        self::assertTrue($gate->isRequired());
        $gate->check(self::request(['authorization' => 'Bearer ' . self::CODE]));
        $this->addToAssertionCount(1);
    }

    public function test_the_scheme_name_is_case_insensitive(): void
    {
        (new AccessCode(self::CODE))->check(self::request(['authorization' => 'bearer ' . self::CODE]));
        $this->addToAssertionCount(1);
    }

    /**
     * @return iterable<string, array{array<string, string>}>
     */
    public static function requestsWithoutABearerCode(): iterable
    {
        yield 'no header' => [[]];
        yield 'empty header' => [['authorization' => '']];
        yield 'scheme only' => [['authorization' => 'Bearer']];
        yield 'basic auth instead' => [['authorization' => 'Basic ' . base64_encode('james:' . self::CODE)]];
        yield 'code without a scheme' => [['authorization' => self::CODE]];
        yield 'two words after Bearer' => [['authorization' => 'Bearer ' . self::CODE . ' extra']];
    }

    /**
     * @param array<string, string> $headers
     */
    #[DataProvider('requestsWithoutABearerCode')]
    public function test_a_missing_code_is_401_access_code_required(array $headers): void
    {
        $error = self::checkFails(new AccessCode(self::CODE), self::request($headers));

        self::assertSame(401, $error->status);
        self::assertSame('access_code_required', $error->errorCode);
        self::assertStringStartsWith('Bearer', $error->headers['WWW-Authenticate'] ?? '');
    }

    /**
     * @return iterable<string, array{string}>
     */
    public static function wrongCodes(): iterable
    {
        yield 'different code' => ['not-the-code'];
        yield 'right code with a different case' => [strtoupper(self::CODE)];
        yield 'right code, one character short' => [substr(self::CODE, 0, -1)];
        yield 'right code plus a character' => [self::CODE . 'x'];
    }

    #[DataProvider('wrongCodes')]
    public function test_a_wrong_code_is_401_invalid_access_code(string $sent): void
    {
        $error = self::checkFails(new AccessCode(self::CODE), self::request(['authorization' => 'Bearer ' . $sent]));

        self::assertSame(401, $error->status);
        self::assertSame('invalid_access_code', $error->errorCode);
        self::assertStringContainsString('invalid_token', $error->headers['WWW-Authenticate'] ?? '');
    }

    private static function checkFails(AccessCode $gate, Request $request): HttpError
    {
        try {
            $gate->check($request);
        } catch (HttpError $error) {
            return $error;
        }
        self::fail('Expected the access code check to refuse the request.');
    }

    /**
     * @param array<string, string> $headers lower-case names, as Request stores them
     */
    private static function request(array $headers): Request
    {
        return new Request('GET', '/api/returns', [], $headers, '');
    }
}
