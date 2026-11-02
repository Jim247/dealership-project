/**
 * Covers F12 argument parsing: the reporting period the CLI accepts.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, parseSummaryArgs } from '../src/args';

describe('parseSummaryArgs', () => {
  it('accepts an inclusive from/to period', () => {
    expect(parseSummaryArgs(['--from', '2026-06', '--to', '2026-10'])).toEqual({
      kind: 'run',
      options: { from: '2026-06', to: '2026-10', dealershipId: null, apiUrl: DEFAULT_API_URL },
    });
  });

  it('treats --month as a single-month period', () => {
    expect(parseSummaryArgs(['--month', '2026-08'])).toMatchObject({
      kind: 'run',
      options: { from: '2026-08', to: '2026-08' },
    });
  });

  it('allows open-ended and unbounded periods', () => {
    expect(parseSummaryArgs(['--from', '2026-09'])).toMatchObject({ options: { from: '2026-09', to: null } });
    expect(parseSummaryArgs([])).toMatchObject({ options: { from: null, to: null } });
  });

  it('accepts a dealership and an API URL, with the env var as fallback', () => {
    expect(parseSummaryArgs(['--dealership', 'NGM', '--api', 'http://x.test'])).toMatchObject({
      options: { dealershipId: 'NGM', apiUrl: 'http://x.test' },
    });
    expect(parseSummaryArgs([], { DEBONAIRE_API_URL: 'http://env.test' })).toMatchObject({
      options: { apiUrl: 'http://env.test' },
    });
  });

  it('recognises --help and -h', () => {
    expect(parseSummaryArgs(['--help'])).toEqual({ kind: 'help' });
    expect(parseSummaryArgs(['-h'])).toEqual({ kind: 'help' });
  });

  it.each([
    [['--from', '2026-13'], '--from must be a month in YYYY-MM format'],
    [['--to', 'October'], '--to must be a month in YYYY-MM format'],
    [['--month', '2026-8'], '--month must be a month in YYYY-MM format'],
    [['--from', '2026-09', '--to', '2026-06'], '--from (2026-09) cannot be after --to (2026-06)'],
    [['--month', '2026-08', '--from', '2026-06'], 'Use either --month or --from/--to'],
    [['--dealership', '  '], '--dealership needs a dealership id'],
    [['--period', 'Q1'], "Unknown option '--period'"],
    [['2026-06'], 'positional argument'],
  ])('rejects %j', (argv, message) => {
    const result = parseSummaryArgs(argv);

    expect(result.kind).toBe('error');
    expect(result.kind === 'error' && result.message).toContain(message);
  });
});
