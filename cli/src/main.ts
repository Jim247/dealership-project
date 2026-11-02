/**
 * Entry point: `npm run summary -- --from 2026-06 --to 2026-10`.
 *
 * Features: F12 CLI summary (spec §3.4).
 */

import { runSummary } from './summary';

process.exitCode = await runSummary(process.argv.slice(2), {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
});
