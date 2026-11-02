<?php

/**
 * Creates the schema and loads the fictional sample data (F1).
 *
 * Usage:
 *   php database/seed.php           add any missing sample rows (safe to re-run)
 *   php database/seed.php --fresh   delete the database first, then seed
 *
 * Honours DEBONAIRE_DB like the API does.
 */

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Debonaire\Api\Persistence\AuditRepository;
use Debonaire\Api\Persistence\Database;
use Debonaire\Api\Persistence\Seeder;

$root = dirname(__DIR__);
$path = getenv('DEBONAIRE_DB') ?: $root . '/var/debonaire.sqlite';

if (in_array('--fresh', $argv, true)) {
    foreach ([$path, $path . '-wal', $path . '-shm'] as $file) {
        if (is_file($file)) {
            unlink($file);
        }
    }
}

$db = Database::open($path);
$db->migrate($root . '/database/schema.sql');
$inserted = (new Seeder($db, new AuditRepository($db)))->run();

printf(
    "Seeded %s: %d new dealership(s), %d new return(s).\n",
    $path,
    $inserted['dealerships'],
    $inserted['returns'],
);
