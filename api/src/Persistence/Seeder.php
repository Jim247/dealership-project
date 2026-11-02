<?php

declare(strict_types=1);

namespace Debonaire\Api\Persistence;

/**
 * Loads the fictional sample data.
 *
 * The data is chosen to exercise every reporting edge case in the spec:
 *  - very different volumes (Northgate ~400 enquiries a month, Harbour ~10);
 *  - a return with zero enquiries (Harbour Cars, 2026-07), whose rate is N/A;
 *  - a month with no returns at all (2026-08);
 *  - a dealership with no returns yet (Meadow Lane Vehicles);
 *  - a free slot (Riverside Autos, 2026-10) to submit during a demo.
 *
 * Re-running the seeder is safe. Existing rows are left untouched and never duplicated.
 *
 * @feature F1 Dealership data and sample returns (spec §3.1, §4 "Reporting consistency")
 */
final class Seeder
{
    /** @var array<string, string> id => name */
    public const DEALERSHIPS = [
        'NGM' => 'Northgate Motors',
        'RVA' => 'Riverside Autos',
        'HBC' => 'Harbour Cars',
        'MLV' => 'Meadow Lane Vehicles',
    ];

    /** @var list<array{0: string, 1: string, 2: int, 3: int}> [dealership, month, enquiries, sales] */
    public const RETURNS = [
        ['NGM', '2026-06', 412, 97],
        ['NGM', '2026-07', 389, 88],
        ['NGM', '2026-09', 450, 121],
        ['NGM', '2026-10', 431, 104],
        ['RVA', '2026-06', 128, 31],
        ['RVA', '2026-07', 140, 29],
        ['RVA', '2026-09', 117, 22],
        ['HBC', '2026-06', 14, 3],
        ['HBC', '2026-07', 0, 0], // zero enquiries: rate must show N/A, not 0% or a division error
        ['HBC', '2026-09', 9, 2],
        // 2026-08 is deliberately empty for every dealership.
    ];

    public function __construct(
        private readonly Database $db,
        private readonly AuditRepository $audit,
    ) {
    }

    /**
     * @return array{dealerships: int, returns: int} how many rows were newly inserted
     */
    public function run(): array
    {
        return $this->db->transaction(function (): array {
            $pdo = $this->db->pdo();
            $inserted = ['dealerships' => 0, 'returns' => 0];

            $addDealership = $pdo->prepare('INSERT OR IGNORE INTO dealerships (id, name) VALUES (:id, :name)');
            foreach (self::DEALERSHIPS as $id => $name) {
                $addDealership->execute(['id' => $id, 'name' => $name]);
                $inserted['dealerships'] += $addDealership->rowCount();
            }

            $addReturn = $pdo->prepare(<<<'SQL'
                INSERT OR IGNORE INTO returns (dealership_id, month, enquiries, sales, created_at, updated_at)
                VALUES (:dealership, :month, :enquiries, :sales, :at, :at)
                SQL);

            foreach (self::RETURNS as [$dealershipId, $month, $enquiries, $sales]) {
                $at = self::submittedAt($month);
                $addReturn->execute([
                    'dealership' => $dealershipId,
                    'month' => $month,
                    'enquiries' => $enquiries,
                    'sales' => $sales,
                    'at' => $at,
                ]);

                if ($addReturn->rowCount() === 1) {
                    $inserted['returns']++;
                    $this->audit->record(
                        (int) $pdo->lastInsertId(),
                        AuditRepository::ACTION_CREATED,
                        'seed',
                        null,
                        null,
                        ['enquiries' => $enquiries, 'sales' => $sales],
                        null,
                        $at,
                    );
                }
            }

            return $inserted;
        });
    }

    /**
     * A plausible submission time: 09:30 UTC on the 3rd of the following month.
     */
    private static function submittedAt(string $month): string
    {
        return (new \DateTimeImmutable($month . '-03T09:30:00Z'))->modify('+1 month')->format('Y-m-d\TH:i:s\Z');
    }
}
