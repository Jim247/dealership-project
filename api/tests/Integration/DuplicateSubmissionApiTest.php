<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Integration;

/**
 * Covers F5 duplicate rejection and F7 idempotent retries
 * (spec §3.2, §4 "Duplicate or concurrent submission").
 */
final class DuplicateSubmissionApiTest extends ApiTestCase
{
    private const NEW_RETURN = ['dealershipId' => 'RVA', 'month' => '2026-10', 'enquiries' => 131, 'sales' => 27];

    private const RVA_OCTOBER = "SELECT COUNT(*) FROM returns WHERE dealership_id = 'RVA' AND month = '2026-10'";

    public function test_a_second_return_for_the_same_dealership_and_month_is_rejected_with_a_useful_message(): void
    {
        // Northgate Motors already has a June 2026 return in the seed.
        $response = $this->post('/api/returns', ['dealershipId' => 'NGM', 'month' => '2026-06', 'enquiries' => 1, 'sales' => 0]);

        $error = self::assertError($response, 409, 'duplicate_return');
        self::assertSame(
            'Northgate Motors already has a return for June 2026 (submitted 3 Jul 2026). Each dealership can submit one '
            . 'return per month. To change the figures, correct the existing return instead.',
            $error['message'],
        );
        // The existing return is included so the UI can point at it.
        self::assertSame(412, $error['existing']['enquiries']);
        self::assertSame(1, $this->countRows("SELECT COUNT(*) FROM returns WHERE dealership_id = 'NGM' AND month = '2026-06'"));
    }

    public function test_concurrent_identical_submissions_store_exactly_one_return(): void
    {
        $responses = $this->postConcurrently('/api/returns', self::NEW_RETURN, 10);

        $statuses = array_map(static fn (ApiResponse $r): int => $r->status, $responses);
        sort($statuses);

        self::assertSame([201, 409, 409, 409, 409, 409, 409, 409, 409, 409], $statuses);
        self::assertSame(1, $this->countRows(self::RVA_OCTOBER));
    }

    public function test_a_retry_with_the_same_idempotency_key_replays_the_original_success(): void
    {
        $headers = self::asManager() + ['Idempotency-Key' => '6f1c0d1e-9a43-4b8e-9d7e-2a6f5e4b3c21'];

        $first = $this->post('/api/returns', self::NEW_RETURN, $headers);
        // Pretend the first response was lost in transit and the browser retries.
        $retry = $this->post('/api/returns', self::NEW_RETURN, $headers);

        self::assertSame(201, $first->status, $first->raw);
        self::assertNull($first->header('Idempotent-Replayed'));
        self::assertSame(201, $retry->status, 'A retry must not turn into a misleading 409. Body: ' . $retry->raw);
        self::assertSame('true', $retry->header('Idempotent-Replayed'));
        self::assertSame($first->json['data'], $retry->json['data']);
        self::assertSame(1, $this->countRows(self::RVA_OCTOBER));
    }

    public function test_concurrent_retries_with_one_idempotency_key_all_succeed_with_one_record(): void
    {
        $headers = self::asManager() + ['Idempotency-Key' => 'double-click-0001'];

        $responses = $this->postConcurrently('/api/returns', self::NEW_RETURN, 5, $headers);

        foreach ($responses as $response) {
            self::assertSame(201, $response->status, $response->raw);
            self::assertSame($responses[0]->json['data']['id'], $response->json['data']['id']);
        }
        self::assertSame(1, $this->countRows(self::RVA_OCTOBER));
    }

    public function test_reusing_an_idempotency_key_for_different_data_is_rejected(): void
    {
        $headers = self::asManager() + ['Idempotency-Key' => 'reused-key-0001'];
        $this->post('/api/returns', self::NEW_RETURN, $headers);

        $response = $this->post('/api/returns', ['enquiries' => 999] + self::NEW_RETURN, $headers);

        self::assertError($response, 422, 'idempotency_key_reused');
        self::assertSame(131, $this->get('/api/returns?from=2026-10&to=2026-10&dealershipId=RVA')->json['data'][0]['enquiries']);
    }

    public function test_a_new_key_for_an_already_submitted_month_is_still_a_duplicate(): void
    {
        $this->post('/api/returns', self::NEW_RETURN, self::asManager() + ['Idempotency-Key' => 'first-attempt-01']);

        $response = $this->post('/api/returns', self::NEW_RETURN, self::asManager() + ['Idempotency-Key' => 'second-attempt-02']);

        self::assertError($response, 409, 'duplicate_return');
    }

    public function test_a_malformed_idempotency_key_is_rejected(): void
    {
        $response = $this->post('/api/returns', self::NEW_RETURN, self::asManager() + ['Idempotency-Key' => 'bad key!']);

        self::assertError($response, 400, 'invalid_idempotency_key');
        self::assertSame(0, $this->countRows(self::RVA_OCTOBER));
    }
}
