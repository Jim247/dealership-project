<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

use Debonaire\Api\Domain\DealershipReturn;
use Debonaire\Api\Domain\Exception\DuplicateReturn;
use Debonaire\Api\Domain\ReportFilter;
use Debonaire\Api\Domain\ReturnInput;
use PDOException;

/**
 * Stores and reads monthly returns.
 *
 * @feature F2 Save a return (spec §3.2)
 * @feature F3 Retrieve returns, with period/dealership filters (spec §3.2, §3.3)
 * @feature F5 Duplicate rejection (spec §3.2)
 */
final class ReturnRepository
{
    /** Shared SELECT so every read returns rows with the same shape and joined dealership name. */
    private const SELECT = <<<'SQL'
        SELECT r.id, r.dealership_id, d.name AS dealership_name, r.month,
               r.enquiries, r.sales, r.created_at, r.updated_at
          FROM returns r
          JOIN dealerships d ON d.id = r.dealership_id
        SQL;

    public function __construct(private readonly Database $db)
    {
    }

    public function find(int $id): ?DealershipReturn
    {
        $statement = $this->db->pdo()->prepare(self::SELECT . ' WHERE r.id = :id');
        $statement->execute(['id' => $id]);
        $row = $statement->fetch();

        return $row === false ? null : $this->hydrate($row);
    }

    public function findByDealershipAndMonth(string $dealershipId, string $month): ?DealershipReturn
    {
        $statement = $this->db->pdo()->prepare(
            self::SELECT . ' WHERE r.dealership_id = :dealership AND r.month = :month',
        );
        $statement->execute(['dealership' => $dealershipId, 'month' => $month]);
        $row = $statement->fetch();

        return $row === false ? null : $this->hydrate($row);
    }

    /**
     * Returns matching the filter, newest month first, then by dealership name.
     *
     * Month bounds are compared as strings. That is correct because
     * zero-padded YYYY-MM sorts in date order.
     *
     * @return list<DealershipReturn>
     */
    public function search(ReportFilter $filter): array
    {
        $where = [];
        $params = [];

        if ($filter->from !== null) {
            $where[] = 'r.month >= :from';
            $params['from'] = $filter->from->toString();
        }
        if ($filter->to !== null) {
            $where[] = 'r.month <= :to';
            $params['to'] = $filter->to->toString();
        }
        if ($filter->dealershipId !== null) {
            $where[] = 'r.dealership_id = :dealership';
            $params['dealership'] = $filter->dealershipId;
        }

        $sql = self::SELECT
            . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
            . ' ORDER BY r.month DESC, d.name ASC, r.id ASC';

        $statement = $this->db->pdo()->prepare($sql);
        $statement->execute($params);

        return array_map($this->hydrate(...), $statement->fetchAll());
    }

    /**
     * Inserts a validated return and returns its new id.
     *
     * Callers check for an existing return first, inside a BEGIN IMMEDIATE
     * transaction, which already prevents races. The UNIQUE constraint is the
     * last line of defence: if it ever fires, it is turned into the same
     * friendly DuplicateReturn instead of a 500.
     *
     * @throws DuplicateReturn
     */
    public function insert(ReturnInput $input, string $now): int
    {
        $statement = $this->db->pdo()->prepare(<<<'SQL'
            INSERT INTO returns (dealership_id, month, enquiries, sales, created_at, updated_at)
            VALUES (:dealership, :month, :enquiries, :sales, :now, :now)
            SQL);

        try {
            $statement->execute([
                'dealership' => $input->dealershipId,
                'month' => $input->month->toString(),
                'enquiries' => $input->enquiries,
                'sales' => $input->sales,
                'now' => $now,
            ]);
        } catch (PDOException $e) {
            $existing = $this->isUniqueViolation($e)
                ? $this->findByDealershipAndMonth($input->dealershipId, $input->month->toString())
                : null;

            throw $existing !== null ? new DuplicateReturn($existing) : $e;
        }

        return (int) $this->db->pdo()->lastInsertId();
    }

    /**
     * Overwrites a return's counts (F8). Callers record the audit entry in the same transaction.
     */
    public function updateCounts(int $id, int $enquiries, int $sales, string $now): void
    {
        $statement = $this->db->pdo()->prepare(
            'UPDATE returns SET enquiries = :enquiries, sales = :sales, updated_at = :now WHERE id = :id',
        );
        $statement->execute(['enquiries' => $enquiries, 'sales' => $sales, 'now' => $now, 'id' => $id]);
    }

    private function isUniqueViolation(PDOException $e): bool
    {
        // SQLSTATE 23000 covers every integrity violation, so the message
        // confirms it was the one-return-per-dealership-per-month rule.
        return $e->getCode() === '23000'
            && str_contains($e->getMessage(), 'UNIQUE constraint failed: returns.dealership_id, returns.month');
    }

    /**
     * @param array<string, mixed> $row
     */
    private function hydrate(array $row): DealershipReturn
    {
        return new DealershipReturn(
            id: (int) $row['id'],
            dealershipId: (string) $row['dealership_id'],
            dealershipName: (string) $row['dealership_name'],
            month: (string) $row['month'],
            enquiries: (int) $row['enquiries'],
            sales: (int) $row['sales'],
            createdAt: (string) $row['created_at'],
            updatedAt: (string) $row['updated_at'],
        );
    }
}
