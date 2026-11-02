<?php

declare(strict_types=1);

namespace Debonaire\Api\Domain;

use Debonaire\Api\Domain\Exception\AccessDenied;

/**
 * Every "who may do what" rule, in one place.
 *
 * Controllers and services ask this class. They never compare roles inline,
 * so the access model can be read, reviewed and tested as a unit.
 *
 * | Action               | Dealer                | Manager |
 * |----------------------|-----------------------|---------|
 * | List dealerships     | own only              | all     |
 * | List returns         | forced to own         | all     |
 * | View one return      | own only              | any     |
 * | Submit a return      | own dealership only   | any     |
 * | Correct a return     | no                    | yes     |
 * | View audit history   | no                    | yes     |
 *
 * MOCK AUTH (F9): the rules here are production-shaped, but the Actor they
 * receive comes from mock headers. Real authentication would supply the
 * Actor, and this class would not change.
 *
 * @feature F9 Mock access control (spec §4 "Access and audit history")
 */
final class AccessPolicy
{
    /**
     * Dealerships the actor may see, e.g. for the form's dropdown.
     *
     * @param list<Dealership> $all
     *
     * @return list<Dealership>
     */
    public function visibleDealerships(Actor $actor, array $all): array
    {
        if ($actor->isManager()) {
            return $all;
        }

        return array_values(array_filter($all, static fn (Dealership $d): bool => $actor->worksAt($d->id)));
    }

    /**
     * Applies the actor's scope to a report filter.
     *
     * A dealer's filter is always narrowed to their own dealership, so leaving
     * the filter out cannot reveal anyone else's data. Explicitly asking for
     * another dealership is refused rather than quietly replaced, so a client
     * bug shows up as an error instead of as misleading figures.
     *
     * @throws AccessDenied
     */
    public function scopeFilter(Actor $actor, ReportFilter $filter): ReportFilter
    {
        if ($actor->isManager()) {
            return $filter;
        }

        if ($filter->dealershipId !== null && !$actor->worksAt($filter->dealershipId)) {
            throw new AccessDenied('Dealers can only view their own dealership\'s returns.');
        }

        return $filter->withDealership($actor->dealershipId);
    }

    /**
     * @throws AccessDenied
     */
    public function assertCanView(Actor $actor, DealershipReturn $return): void
    {
        if (!$actor->isManager() && !$actor->worksAt($return->dealershipId)) {
            throw new AccessDenied('Dealers can only view their own dealership\'s returns.');
        }
    }

    /**
     * A dealership may only submit its own data (spec §4). Managers may submit
     * on behalf of any dealership, e.g. when keying in a paper return.
     *
     * @throws AccessDenied
     */
    public function assertCanSubmitFor(Actor $actor, string $dealershipId): void
    {
        if (!$actor->isManager() && !$actor->worksAt($dealershipId)) {
            throw new AccessDenied('Dealers can only submit returns for their own dealership.');
        }
    }

    /**
     * Only managers correct returns. Each correction is audited, and keeping
     * it to a reviewing role stops a dealership revising its own history unseen.
     *
     * @throws AccessDenied
     */
    public function assertCanCorrect(Actor $actor): void
    {
        if (!$actor->isManager()) {
            throw new AccessDenied('Only managers can correct a return.');
        }
    }

    /**
     * @throws AccessDenied
     */
    public function assertCanViewAudit(Actor $actor): void
    {
        if (!$actor->isManager()) {
            throw new AccessDenied('Only managers can view a return\'s history.');
        }
    }
}
