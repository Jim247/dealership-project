/**
 * Tests for the setup pre-flight check (F14: run instructions).
 *
 * Covers the version rules (which must match package.json `engines` and
 * api/composer.json `php`) and the php.ini edit used by `npm run setup:php-ini`.
 */
import { describe, expect, it } from 'vitest';
import {
  REQUIRED_EXTENSIONS,
  enableExtensions,
  extensionsFor,
  missingExtensions,
  nodeVersionSupported,
  parseRegistryPath,
  phpVersionStatus,
} from '../check-setup.mjs';

/** The extension block of PHP's own php.ini-development, as shipped for Windows. */
const TEMPLATE = [
  '[PHP]',
  '; Directory in which the loadable extensions (modules) reside.',
  ';extension_dir = "./"',
  '; On windows:',
  ';extension_dir = "ext"',
  '',
  ';extension=bz2',
  ';extension=curl',
  ';extension=mbstring',
  ';extension=openssl',
  ';extension=pdo_mysql',
  ';extension=pdo_sqlite',
  ';extension=sqlite3',
  ';extension=zip',
  '',
  '[ffi]',
  ';ffi.enable=preload',
  '',
].join('\r\n');

describe('nodeVersionSupported', () => {
  it('accepts the versions in package.json engines', () => {
    expect(nodeVersionSupported('22.12.0')).toBe(true);
    expect(nodeVersionSupported('24.0.0')).toBe(true);
    expect(nodeVersionSupported('26.13.0')).toBe(true);
  });

  it('rejects Node older than 22.12 and the short-lived odd releases', () => {
    expect(nodeVersionSupported('22.11.0')).toBe(false);
    expect(nodeVersionSupported('20.18.0')).toBe(false);
    expect(nodeVersionSupported('23.5.0')).toBe(false);
    expect(nodeVersionSupported('25.1.0')).toBe(false);
  });
});

describe('phpVersionStatus', () => {
  it('accepts the first patched release in each line, and later ones', () => {
    for (const version of ['8.3.36', '8.4.27', '8.5.12', '8.5.13', '8.6.0', '9.0.0']) {
      expect(phpVersionStatus(version), version).toBe('ok');
    }
  });

  it('flags releases without the PHP2Shell fixes as unpatched', () => {
    for (const version of ['8.3.35', '8.4.26', '8.5.11']) {
      expect(phpVersionStatus(version), version).toBe('unpatched');
    }
  });

  it('flags PHP older than 8.3 as too old', () => {
    expect(phpVersionStatus('8.2.30')).toBe('too-old');
    expect(phpVersionStatus('7.4.33')).toBe('too-old');
  });
});

describe('extensionsFor', () => {
  it('requires zip on Windows, where Composer has no reliable unzip to fall back on', () => {
    expect(extensionsFor('Windows').required).toContain('zip');
    expect(extensionsFor('Windows').recommended).toEqual([]);
  });

  it('only recommends zip on macOS and Linux, where Composer can use unzip', () => {
    expect(extensionsFor('Darwin').required).not.toContain('zip');
    expect(extensionsFor('Linux').recommended).toEqual(['zip']);
  });
});

describe('parseRegistryPath', () => {
  const output = [
    '',
    'HKEY_CURRENT_USER\\Environment',
    '    Path    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;;C:\\php;%UNSET%\\bin;',
    '',
  ].join('\r\n');

  it('splits the folders, drops empty ones and expands variables without regard to case', () => {
    expect(parseRegistryPath(output, { userprofile: 'C:\\Users\\Sam' })).toEqual([
      'C:\\Users\\Sam\\AppData\\Local\\Microsoft\\WindowsApps',
      'C:\\php',
      '%UNSET%\\bin',
    ]);
  });

  it('returns nothing when the key has no Path value', () => {
    expect(parseRegistryPath('ERROR: The system was unable to find the specified registry key or value.', {})).toEqual([]);
  });
});

describe('missingExtensions', () => {
  it('compares names without regard to case, as PHP reports PDO in capitals', () => {
    const loaded = ['Core', 'PDO', 'curl', 'json', 'mbstring', 'openssl'];
    expect(missingExtensions(loaded, REQUIRED_EXTENSIONS)).toEqual(['pdo_sqlite']);
  });
});

describe('enableExtensions', () => {
  it('uncomments the template lines and keeps Windows line endings', () => {
    const result = enableExtensions(TEMPLATE, ['pdo_sqlite', 'zip']);

    expect(result.enabled).toEqual(['pdo_sqlite', 'zip']);
    expect(result.text).toContain('\r\nextension=pdo_sqlite\r\n');
    expect(result.text).toContain('\r\nextension=zip\r\n');
    // Neighbouring extensions stay off.
    expect(result.text).toContain(';extension=pdo_mysql');
    expect(result.text).toContain(';extension=sqlite3');
    expect(result.text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('appends an extension that has no line at all', () => {
    const result = enableExtensions('[PHP]\nmemory_limit = 128M\n', ['pdo_sqlite']);

    expect(result.enabled).toEqual(['pdo_sqlite']);
    expect(result.text).toMatch(/memory_limit = 128M\n\n; Added by the Debonaire setup .*\nextension=pdo_sqlite\n$/);
  });

  it('recognises the older php_name.dll form', () => {
    const result = enableExtensions(';extension=php_pdo_sqlite.dll\n', ['pdo_sqlite']);
    expect(result.text).toBe('extension=pdo_sqlite\n');
  });

  it('leaves an extension alone when it is already switched on', () => {
    const result = enableExtensions('extension=pdo_sqlite\n', ['pdo_sqlite']);

    expect(result.enabled).toEqual([]);
    expect(result.alreadyActive).toEqual(['pdo_sqlite']);
    expect(result.text).toBe('extension=pdo_sqlite\n');
  });

  it('sets extension_dir on the Windows example line when asked', () => {
    const result = enableExtensions(TEMPLATE, ['pdo_sqlite'], 'C:\\php85\\ext');

    expect(result.text).toContain('\r\nextension_dir = "C:\\php85\\ext"\r\n');
    expect(result.text).toContain(';extension_dir = "./"');
  });

  it('replaces an active extension_dir rather than adding a second one', () => {
    const result = enableExtensions('extension_dir = "C:\\php\\ext"\n;extension=zip\n', ['zip'], 'D:\\php\\ext');

    expect(result.text).toBe('extension_dir = "D:\\php\\ext"\nextension=zip\n');
  });
});
