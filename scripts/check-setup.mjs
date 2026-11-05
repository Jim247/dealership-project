/**
 * Setup pre-flight check (F14: run instructions, spec §3.5).
 *
 * `npm run setup` runs this before it installs anything. If a tool or a PHP
 * extension is missing, setup stops here with a message that says how to fix
 * it, instead of Composer failing halfway through. It only uses Node's own
 * modules, because it runs before `npm install`.
 *
 *   node scripts/check-setup.mjs                 check, and exit 1 if something is missing
 *   node scripts/check-setup.mjs --fix-php-ini   switch on the PHP extensions the project needs
 *
 * Why --fix-php-ini exists: PHP for Windows ships with most extensions
 * switched off, and the php.ini that Composer-Setup.exe writes does not switch
 * on pdo_sqlite. Editing that file by hand is the step people miss. The fix
 * only edits the php.ini that PHP reports loading (on Windows it creates one
 * from PHP's development template if there is none), and it saves a backup
 * first. It never runs as part of `npm run setup`, so it never edits
 * anything without being asked.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Extensions the API, seed script and tests cannot run without (see api/composer.json). */
export const REQUIRED_EXTENSIONS = ['curl', 'json', 'mbstring', 'openssl', 'pdo', 'pdo_sqlite'];

/**
 * The extensions to insist on for a PHP running on `os` (PHP_OS_FAMILY).
 *
 * Composer unpacks packages with zip. On macOS and Linux it can use the
 * system `unzip` command instead, so zip is only recommended there. On
 * Windows the only other option is a 7z.exe on PATH, and the copies that
 * management tools install are often too old for Composer and fail on paths
 * with spaces. Without zip there is then no fallback, so Windows needs it.
 *
 * @param {string} os
 * @returns {{ required: string[], recommended: string[] }}
 */
export function extensionsFor(os) {
  return os === 'Windows'
    ? { required: [...REQUIRED_EXTENSIONS, 'zip'], recommended: [] }
    : { required: REQUIRED_EXTENSIONS, recommended: ['zip'] };
}

/**
 * Whether this Node.js version is one the project supports. It mirrors the
 * `engines` field in package.json: Vitest 5 needs 22.12, and odd-numbered
 * releases are short-lived, so they are not supported.
 *
 * @param {string} version for example "22.13.0"
 * @returns {boolean}
 */
export function nodeVersionSupported(version) {
  const [major = 0, minor = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  return (major === 22 && minor >= 12) || major === 24 || major >= 26;
}

/**
 * Checks a PHP version against the project's minimum and the October 2026
 * "PHP2Shell" security fixes (CVE-2026-109618, CVE-2026-109619). This mirrors
 * the `php` constraint in api/composer.json.
 *
 * @param {string} version for example "8.5.12"
 * @returns {'ok' | 'too-old' | 'unpatched'}
 */
export function phpVersionStatus(version) {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  if (major < 8 || (major === 8 && minor < 3)) {
    return 'too-old';
  }
  // The first patched release in each supported 8.x line.
  const firstPatched = { 3: 36, 4: 27, 5: 12 };
  if (major === 8 && minor in firstPatched) {
    return patch >= firstPatched[/** @type {3 | 4 | 5} */ (minor)] ? 'ok' : 'unpatched';
  }
  return 'ok';
}

/**
 * @param {string[]} loaded extension names PHP reports, any case
 * @param {string[]} wanted
 * @returns {string[]} the wanted names that are not loaded
 */
export function missingExtensions(loaded, wanted) {
  const have = new Set(loaded.map((name) => name.toLowerCase()));
  return wanted.filter((name) => !have.has(name));
}

/**
 * Switches extensions on in the text of a php.ini file. The file's comments
 * and layout are kept, so it still reads like PHP's own template:
 * - a commented-out line such as `;extension=pdo_sqlite` loses its `;`;
 * - an extension with no line at all gets `extension=<name>` at the end;
 * - an extension that already has an active line is left alone (the cause is
 *   then a missing DLL, not the ini file).
 * If `extensionDir` is given, `extension_dir` is set to it, because PHP for
 * Windows otherwise looks in C:\php\ext.
 *
 * @param {string} text the current php.ini contents
 * @param {string[]} names extensions to switch on
 * @param {string | null} [extensionDir] absolute folder holding the extension files
 * @returns {{ text: string, enabled: string[], alreadyActive: string[] }}
 */
export function enableExtensions(text, names, extensionDir = null) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const appended = [];
  const enabled = [];
  const alreadyActive = [];

  if (extensionDir !== null) {
    const setting = `extension_dir = "${extensionDir}"`;
    const active = lines.findIndex((line) => /^\s*extension_dir\s*=/.test(line));
    // PHP's template has two commented examples; the Windows one ends in "ext".
    const windowsExample = lines.findIndex((line) => /^\s*;\s*extension_dir\s*=\s*"ext"\s*$/.test(line));
    if (active !== -1) {
      lines[active] = setting;
    } else if (windowsExample !== -1) {
      lines[windowsExample] = setting;
    } else {
      appended.push(setting);
    }
  }

  for (const name of names) {
    const file = `"?(?:php_)?${name}(?:\\.dll|\\.so)?"?`;
    const activePattern = new RegExp(`^\\s*extension\\s*=\\s*${file}\\s*$`, 'i');
    const commentedPattern = new RegExp(`^\\s*;+\\s*extension\\s*=\\s*${file}\\s*$`, 'i');

    if (lines.some((line) => activePattern.test(line))) {
      alreadyActive.push(name);
      continue;
    }
    const commented = lines.findIndex((line) => commentedPattern.test(line));
    if (commented !== -1) {
      lines[commented] = `extension=${name}`;
    } else {
      appended.push(`extension=${name}`);
    }
    enabled.push(name);
  }

  if (appended.length > 0) {
    // Drop trailing blank lines so the block sits neatly at the end of the file.
    while (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    lines.push('', '; Added by the Debonaire setup (npm run setup:php-ini).', ...appended, '');
  }

  return { text: lines.join(eol), enabled, alreadyActive };
}

// ---- Talking to the installed tools -----------------------------------------

/**
 * The PHP code used to describe the installed PHP. Its output is marked,
 * because PHP may print start-up warnings (such as a missing DLL) first.
 */
const PHP_PROBE = `echo "\\n@@DEBONAIRE@@", json_encode([
  'version' => PHP_VERSION,
  'binary' => PHP_BINARY,
  'os' => PHP_OS_FAMILY,
  'ini' => php_ini_loaded_file(),
  'extensionDir' => (string) ini_get('extension_dir'),
  'shlibSuffix' => PHP_SHLIB_SUFFIX,
  'extensions' => get_loaded_extensions(),
]);`;

/**
 * @typedef {{ version: string, binary: string, os: string, ini: string | false,
 *   extensionDir: string, shlibSuffix: string, extensions: string[], warnings: string }} PhpInfo
 */

/**
 * Asks the `php` on PATH about itself. Returns null if there is no `php`.
 *
 * @returns {PhpInfo | null}
 */
function probePhp() {
  const result = spawnSync('php', ['-r', PHP_PROBE], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return null;
  }
  const marker = result.stdout.lastIndexOf('@@DEBONAIRE@@');
  if (marker === -1) {
    return null;
  }
  const warnings = `${result.stdout.slice(0, marker)}${result.stderr}`.trim();
  return { ...JSON.parse(result.stdout.slice(marker + '@@DEBONAIRE@@'.length)), warnings };
}

/**
 * Asks Composer for its version, and which PHP it runs on.
 *
 * @returns {{ version: string, phpBinary: string | null } | null} null if Composer is not on PATH
 */
function probeComposer() {
  // composer is a .bat file on Windows, which Node can only start through a shell.
  // The command is fixed text, so the shell is safe here.
  const result = spawnSync('composer --version --no-ansi', { encoding: 'utf8', shell: true });
  if (result.error || result.status !== 0) {
    return null;
  }
  const output = `${result.stdout}${result.stderr}`;
  return {
    version: /Composer version (\S+)/.exec(output)?.[1] ?? 'unknown',
    phpBinary: /PHP version \S+ \((.+?)\)/.exec(output)?.[1] ?? null,
  };
}

/**
 * The folder PHP really loads extensions from. On Windows a relative
 * extension_dir (such as "ext") is resolved against php.exe's folder.
 *
 * @param {PhpInfo} php
 * @returns {string}
 */
function resolvedExtensionDir(php) {
  return path.isAbsolute(php.extensionDir)
    ? php.extensionDir
    : path.resolve(path.dirname(php.binary), php.extensionDir);
}

/**
 * The file an extension is loaded from, for example php_pdo_sqlite.dll.
 *
 * @param {PhpInfo} php
 * @param {string} name
 * @returns {string}
 */
function extensionFileName(php, name) {
  return php.os === 'Windows' ? `php_${name}.dll` : `${name}.${php.shlibSuffix}`;
}

/** The command that installs PHP's extensions on each system, for messages. */
function installHint(php) {
  if (php.os === 'Windows') {
    return 'Unzip the full PHP download from https://windows.php.net/download again, or reinstall with winget; the ext folder holds every extension.';
  }
  if (php.os === 'Darwin') {
    return 'Reinstall PHP with `brew reinstall php`; Homebrew\'s PHP includes every extension.';
  }
  return 'Install them with your package manager, for example `sudo apt install php-curl php-mbstring php-sqlite3 php-zip`.';
}

/**
 * Reads the folders from `reg query <key> /v Path` output, expanding
 * %VARIABLES% the way Windows does when it builds a new program's PATH.
 *
 * @param {string} output what `reg query` printed
 * @param {Record<string, string | undefined>} env variables to expand
 * @returns {string[]}
 */
export function parseRegistryPath(output, env) {
  const match = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*?)\s*$/im.exec(output);
  if (!match) {
    return [];
  }
  const lookup = new Map(Object.entries(env).map(([name, value]) => [name.toLowerCase(), value]));
  return match[1]
    .split(';')
    .map((dir) => dir.replace(/%([^%]+)%/g, (whole, name) => lookup.get(name.toLowerCase()) ?? whole).trim())
    .filter((dir) => dir !== '');
}

/**
 * The PATH Windows gives to programs started from now on: the machine and
 * user settings in the registry. A terminal that was already open when PATH
 * changed keeps the old one, and so does every terminal in a VS Code that was
 * already running, even a new terminal tab.
 *
 * @returns {string[]}
 */
function savedWindowsPath() {
  const keys = ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', 'HKCU\\Environment'];
  return keys.flatMap((key) => {
    const result = spawnSync('reg', ['query', key, '/v', 'Path'], { encoding: 'utf8' });
    return result.error ? [] : parseRegistryPath(result.stdout, process.env);
  });
}

/**
 * Where a program would be found on Windows' saved PATH, or null. Used to
 * tell "not installed" apart from "installed, but this terminal is too old to
 * see it".
 *
 * @param {string[]} fileNames for example ['composer.bat', 'composer.exe']
 * @returns {string | null}
 */
function findOnSavedPath(fileNames) {
  if (process.platform !== 'win32') {
    return null;
  }
  for (const dir of savedWindowsPath()) {
    for (const fileName of fileNames) {
      if (existsSync(path.join(dir, fileName))) {
        return path.join(dir, fileName);
      }
    }
  }
  return null;
}

/**
 * Every copy of a program on this terminal's PATH, first one first (the one
 * that runs). Symlinks to the same file count once.
 *
 * @param {string} name
 * @returns {string[]}
 */
function findAllOnPath(name) {
  const result =
    process.platform === 'win32'
      ? spawnSync('where', [name], { encoding: 'utf8' })
      : spawnSync('which', ['-a', name], { encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    return [];
  }
  const found = [];
  for (const candidate of result.stdout.split(/\r?\n/).map((line) => line.trim())) {
    if (candidate !== '' && !found.some((seen) => samePath(seen, candidate))) {
      found.push(candidate);
    }
  }
  return found;
}

/** Shown when a tool is installed but the terminal started before PATH was changed. */
const RESTART_HINT = [
  'This terminal started before PATH was changed, so it cannot see it yet.',
  'Close every VS Code window and open VS Code again (a new terminal tab is not enough),',
  'or open a new PowerShell window. Then run `npm run setup` again.',
];

// ---- The check ---------------------------------------------------------------

/** One line of the report: ok, a warning that does not stop setup, or a failure. */
function report(level, message) {
  const tag = { ok: '  ok    ', warn: '  warn  ', fail: '  FAIL  ' }[level];
  console.log(`${tag}${message}`);
}

/**
 * Runs every check and prints a report.
 *
 * @returns {boolean} true if setup can go ahead
 */
function check() {
  let ready = true;
  console.log('Checking the tools Debonaire needs...');

  const node = process.versions.node;
  if (nodeVersionSupported(node)) {
    report('ok', `Node.js ${node}`);
  } else {
    ready = false;
    report('fail', `Node.js ${node} is not supported. Install Node.js 22.12 or later (24 or 26 are fine).`);
  }

  const php = probePhp();
  if (php === null) {
    const saved = findOnSavedPath(['php.exe']);
    if (saved !== null) {
      report('fail', `PHP is installed at ${saved}, but this terminal cannot see it.`);
      console.log(['', ...RESTART_HINT].join('\n'));
    } else {
      report('fail', 'PHP was not found. Install it (see "Install and run" in the README), then open a new terminal.');
    }
    return false;
  }

  const status = phpVersionStatus(php.version);
  if (status === 'ok') {
    report('ok', `PHP ${php.version} (${php.binary})`);
  } else {
    ready = false;
    report(
      'fail',
      status === 'too-old'
        ? `PHP ${php.version} is too old. The project needs PHP 8.3 or later.`
        : `PHP ${php.version} is missing the October 2026 "PHP2Shell" security fixes. Update to 8.3.36, 8.4.27, 8.5.12 or later.`,
    );
  }

  // Two PHPs on PATH is the usual cause of "I switched the extension on and nothing changed":
  // only the first one runs, and the other's php.ini is ignored.
  const copies = findAllOnPath('php');
  if (copies.length > 1) {
    report(
      'warn',
      `More than one PHP is on PATH. Only the first runs, so its php.ini is the one that counts:\n` +
        copies.map((copy, i) => `          ${i === 0 ? 'used:   ' : 'ignored:'} ${copy}`).join('\n') +
        '\n          Remove the folders you do not use from PATH, or move the one you want to the top.',
    );
  }

  const { required, recommended } = extensionsFor(php.os);
  const missing = missingExtensions(php.extensions, required);
  const missingOptional = missingExtensions(php.extensions, recommended);
  if (missing.length === 0) {
    report('ok', `PHP extensions: ${required.join(', ')}`);
  } else {
    ready = false;
    report('fail', `PHP extensions not switched on: ${missing.join(', ')}`);
  }
  if (missingOptional.length > 0) {
    report('warn', `PHP extension not switched on: ${missingOptional.join(', ')} (optional; Composer uses unzip without it)`);
  }
  if (php.warnings !== '') {
    report('warn', `PHP printed warnings when it started:\n${indent(php.warnings, 10)}`);
  }

  const composer = probeComposer();
  if (composer === null) {
    ready = false;
    const saved = findOnSavedPath(['composer.bat', 'composer.cmd', 'composer.exe']);
    if (saved !== null) {
      report('fail', `Composer is installed at ${saved}, but this terminal cannot see it.`);
      console.log(['', ...RESTART_HINT].join('\n'));
    } else {
      report('fail', 'Composer was not found. Install it (see "Install and run" in the README), then open a new terminal.');
    }
  } else {
    report('ok', `Composer ${composer.version}`);
    if (composer.phpBinary !== null && !samePath(composer.phpBinary, php.binary)) {
      report(
        'warn',
        `Composer runs a different PHP (${composer.phpBinary}) from the one on PATH. ` +
          'The extensions must be switched on in that PHP too.',
      );
    }
  }

  if (missing.length > 0) {
    explainMissingExtensions(php, [...missing, ...missingOptional]);
  }
  return ready;
}

/**
 * Says exactly where the extensions are switched on, and how to do it.
 *
 * @param {PhpInfo} php
 * @param {string[]} names
 */
function explainMissingExtensions(php, names) {
  console.log('');
  if (php.ini === false) {
    console.log('PHP is not loading a php.ini file, so most of its extensions are off.');
  } else {
    console.log(`PHP is loading ${php.ini}`);
    console.log('That file does not switch on every extension the project needs.');
  }
  console.log('');
  console.log('To switch them on, run:');
  console.log('');
  console.log('    npm run setup:php-ini');
  console.log('');
  console.log('It saves a backup of php.ini first. Or edit php.ini by hand: remove the ";" from the start of');
  console.log(`these lines (add them if they are not there): ${names.map((name) => `extension=${name}`).join(', ')}`);
  console.log('Then run `npm run setup` again.');
}

// ---- The php.ini fix -----------------------------------------------------------

/**
 * Switches on the missing extensions in the php.ini that PHP loads.
 *
 * @returns {boolean} true if every required extension is now loaded
 */
function fixPhpIni() {
  const php = probePhp();
  if (php === null) {
    console.error('PHP was not found. Install it first (see "Install and run" in the README).');
    return false;
  }

  const { required, recommended } = extensionsFor(php.os);
  const wanted = [...required, ...recommended];
  const missing = missingExtensions(php.extensions, wanted);
  if (missing.length === 0) {
    console.log(`Nothing to change: PHP already has ${wanted.join(', ')} switched on.`);
    return true;
  }

  // Only extensions whose file is in PHP's ext folder can be switched on in php.ini.
  // json and pdo are built into every modern PHP, so they never have a file.
  const phpDir = path.dirname(php.binary);
  const bundledExtDir = path.join(phpDir, 'ext');
  const currentExtDir = resolvedExtensionDir(php);
  const fileIn = (dir, name) => existsSync(path.join(dir, extensionFileName(php, name)));
  const extDir = missing.every((name) => fileIn(currentExtDir, name)) ? currentExtDir : bundledExtDir;
  const notInstalled = missing.filter((name) => !fileIn(extDir, name));
  const toEnable = missing.filter((name) => fileIn(extDir, name));

  if (toEnable.length === 0) {
    console.error(`These extensions are not installed with this PHP, so php.ini cannot switch them on: ${notInstalled.join(', ')}`);
    console.error(installHint(php));
    return false;
  }

  // Which file to edit. With no php.ini, PHP for Windows reads one next to php.exe,
  // so create it there from PHP's own development template.
  let iniPath = php.ini;
  let original;
  if (iniPath === false) {
    const template = path.join(phpDir, 'php.ini-development');
    if (php.os !== 'Windows' || !existsSync(template)) {
      console.error('PHP is not loading a php.ini file. Run `php --ini` to see where PHP looks for one, create it there, then run this again.');
      return false;
    }
    iniPath = path.join(phpDir, 'php.ini');
    original = readFileSync(template, 'utf8');
    console.log(`PHP has no php.ini. Creating ${iniPath} from PHP's development template.`);
  } else {
    original = readFileSync(iniPath, 'utf8');
  }

  // Set extension_dir only when PHP is not already looking in the right folder.
  const needsExtDir = php.ini === false || extDir !== currentExtDir;
  const result = enableExtensions(original, toEnable, needsExtDir ? extDir : null);

  try {
    if (php.ini !== false) {
      const backup = `${iniPath}.backup-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
      copyFileSync(iniPath, backup);
      console.log(`Saved a backup of php.ini as ${backup}`);
    }
    writeFileSync(iniPath, result.text, 'utf8');
  } catch (error) {
    console.error(`Could not write ${iniPath}: ${error instanceof Error ? error.message : String(error)}`);
    console.error('PHP is probably installed for all users. Open the terminal as administrator and run this again,');
    console.error(`or edit the file by hand and switch on: ${toEnable.map((name) => `extension=${name}`).join(', ')}`);
    return false;
  }

  if (result.enabled.length > 0) {
    console.log(`Switched on in ${iniPath}: ${result.enabled.join(', ')}`);
  }
  if (needsExtDir) {
    console.log(`Set extension_dir to ${extDir}`);
  }
  if (result.alreadyActive.length > 0) {
    console.log(`Already switched on in php.ini, but PHP could not load: ${result.alreadyActive.join(', ')}. ${installHint(php)}`);
  }
  if (notInstalled.length > 0) {
    console.log(`Not installed with this PHP: ${notInstalled.join(', ')}. ${installHint(php)}`);
  }

  console.log('');
  return check();
}

// ---- Helpers -------------------------------------------------------------------

/** @param {string} text @param {number} spaces */
function indent(text, spaces) {
  return text
    .split(/\r?\n/)
    .map((line) => `${' '.repeat(spaces)}${line}`)
    .join('\n');
}

/** Windows paths are case-insensitive, and winget and Homebrew put symlinks on PATH. */
function samePath(a, b) {
  const normalise = (p) => {
    let real = path.resolve(p);
    try {
      real = realpathSync.native(real);
    } catch {
      // A path that cannot be resolved is compared as it is.
    }
    return process.platform === 'win32' ? real.toLowerCase() : real;
  };
  return normalise(a) === normalise(b);
}

// Run only when started as a script, so the tests can import the functions above.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ok = process.argv.includes('--fix-php-ini') ? fixPhpIni() : check();
  if (!ok) {
    process.exitCode = 1;
  }
}
