<?php

declare(strict_types=1);

namespace Debonaire\Api\Tests\Unit;

use Debonaire\Api\Domain\AccessPolicy;
use Debonaire\Api\Domain\Actor;
use Debonaire\Api\Domain\Dealership;
use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Domain\Exception\AccessDenied;
use Debonaire\Api\Domain\ReportFilter;
use PHPUnit\Framework\TestCase;

/**
 * Covers the F9 access matrix (spec §4 "Access and audit history").
 */
final class AccessPolicyTest extends TestCase
{
    private AccessPolicy $policy;

    protected function setUp(): void
    {
        $this->policy = new AccessPolicy();
    }

    private static function returnFor(string $dealershipId): DealershipReturn
    {
        return new DealershipReturn(1, $dealershipId, 'Test', '2026-10', 10, 2, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z');
    }

    public function test_a_manager_sees_every_dealership(): void
    {
        $all = [new Dealership('HBC', 'Harbour Cars'), new Dealership('NGM', 'Northgate Motors')];

        self::assertSame($all, $this->policy->visibleDealerships(Actor::manager(), $all));
    }

    public function test_a_dealer_sees_only_their_own_dealership(): void
    {
        $all = [new Dealership('HBC', 'Harbour Cars'), new Dealership('NGM', 'Northgate Motors')];

        $visible = $this->policy->visibleDealerships(Actor::dealer('NGM'), $all);

        self::assertSame(['NGM'], array_map(static fn (Dealership $d): string => $d->id, $visible));
    }

    public function test_a_managers_filter_is_left_as_requested(): void
    {
        $filter = new ReportFilter(null, null, null);

        self::assertSame($filter, $this->policy->scopeFilter(Actor::manager(), $filter));
    }

    public function test_a_dealers_filter_is_forced_to_their_own_dealership(): void
    {
        $scoped = $this->policy->scopeFilter(Actor::dealer('NGM'), new ReportFilter(null, null, null));

        self::assertSame('NGM', $scoped->dealershipId);
    }

    public function test_a_dealer_asking_for_another_dealership_is_refused(): void
    {
        $this->expectException(AccessDenied::class);

        $this->policy->scopeFilter(Actor::dealer('NGM'), new ReportFilter(null, null, 'HBC'));
    }

    public function test_viewing_a_single_return(): void
    {
        $this->policy->assertCanView(Actor::manager(), self::returnFor('HBC'));
        $this->policy->assertCanView(Actor::dealer('HBC'), self::returnFor('HBC'));

        $this->expectException(AccessDenied::class);
        $this->policy->assertCanView(Actor::dealer('NGM'), self::returnFor('HBC'));
    }

    public function test_a_dealer_may_submit_only_for_their_own_dealership(): void
    {
        $this->policy->assertCanSubmitFor(Actor::dealer('NGM'), 'NGM');
        $this->policy->assertCanSubmitFor(Actor::manager(), 'HBC');

        $this->expectException(AccessDenied::class);
        $this->policy->assertCanSubmitFor(Actor::dealer('NGM'), 'HBC');
    }

    public function test_only_managers_may_correct(): void
    {
        $this->policy->assertCanCorrect(Actor::manager());

        $this->expectException(AccessDenied::class);
        $this->policy->assertCanCorrect(Actor::dealer('NGM'));
    }

    public function test_only_managers_may_view_audit_history(): void
    {
        $this->policy->assertCanViewAudit(Actor::manager());

        $this->expectException(AccessDenied::class);
        $this->policy->assertCanViewAudit(Actor::dealer('NGM'));
    }
}
