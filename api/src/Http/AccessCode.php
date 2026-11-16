<?php

declare(strict_types=1);

namespace Debonaire\Api\Http;

/**
 * The public demo's shared access code (D22).
 *
 * When DEBONAIRE_ACCESS_CODE is set, as it is on the public demo, every
 * request must send the code as:
 *
 *     Authorization: Bearer <code>
 *
 * When it is not set, as on a local run or in the test suites, nothing is
 * checked and the API behaves exactly as before.
 *
 * This is a gate, not a login. It keeps people without the code out of the
 * demo, but everyone with the code is the same to the API. Who the caller is
 * still comes from the mock identity headers (F9). Production would replace
 * both with a real sign-in.
 *
 * @feature F15 Shared access code for the public demo
 */
final class AccessCode
{
    private const REALM = 'Bearer realm="Debonaire demo"';

    /**
     * @param string|null $code the code to require, or null to require none
     */
    public function __construct(private readonly ?string $code)
    {
    }

    public function isRequired(): bool
    {
        return $this->code !== null;
    }

    /**
     * @throws HttpError 401 access_code_required when no Bearer code is sent,
     *                   401 invalid_access_code when the code is wrong
     */
    public function check(Request $request): void
    {
        if ($this->code === null) {
            return;
        }

        // The scheme name is case-insensitive (RFC 9110), so "bearer" counts too.
        $header = $request->header('authorization') ?? '';
        if (preg_match('/^Bearer[ \t]+(\S+)$/i', trim($header), $match) !== 1) {
            throw new HttpError(
                401,
                'access_code_required',
                'This demo needs an access code. Send it as Authorization: Bearer <code>.',
                ['WWW-Authenticate' => self::REALM],
            );
        }

        // hash_equals takes the same time however much of the code matches,
        // so timing the response gives nothing away.
        if (!hash_equals($this->code, $match[1])) {
            throw new HttpError(
                401,
                'invalid_access_code',
                'That access code is not valid.',
                ['WWW-Authenticate' => self::REALM . ', error="invalid_token"'],
            );
        }
    }
}
