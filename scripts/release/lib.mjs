// Shared helpers for the release scripts. Plain Node, no dependencies, so the
// same commands work on Windows and macOS.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))
export const ENV_FILE = join(REPO_ROOT, 'fastlane', '.env')
export const ENV_EXAMPLE = join(REPO_ROOT, 'fastlane', '.env.example')

const isWindows = process.platform === 'win32'
export const isMac = process.platform === 'darwin'

/** Stops the script with a readable message rather than a stack trace. */
export function fail(message) {
  console.error(`\n✖ ${message}`)
  process.exit(1)
}

export function heading(message) {
  console.log(`\n==> ${message}`)
}

/** Parses fastlane/.env. Blank values are left out, so `config.X` is falsy when unset. */
export function readDotEnv() {
  const values = {}
  if (!existsSync(ENV_FILE)) return values
  for (const raw of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
    if (value) values[key] = value
  }
  return values
}

export function requireDotEnv() {
  if (!existsSync(ENV_FILE)) fail('fastlane/.env is missing. Run: npm run release:setup')
  return readDotEnv()
}

/** Paths in fastlane/.env may be relative to the repo root. */
export function repoPath(path) {
  return isAbsolute(path) ? path : resolve(REPO_ROOT, path)
}

/** Reads `--name value` and `--flag` style options from process.argv. */
export function parseArgs(argv = process.argv.slice(2)) {
  const positional = []
  const options = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) {
      positional.push(arg)
      continue
    }
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next
      i++
    } else {
      options[key] = true
    }
  }
  return { positional, options }
}

const WINDOWS_SHIMS = new Set(['npm', 'npx', 'bundle', 'gcloud'])

function quoteForCmd(arg) {
  return /[\s"()&|<>^]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
}

/**
 * Runs a command with inherited stdio and stops the script if it fails.
 * `input` is piped to stdin instead (used to pass secrets without putting
 * them on a command line).
 */
export function run(command, args = [], { env, input, cwd = REPO_ROOT, check = true } = {}) {
  // npm, npx and bundle are .cmd/.bat shims on Windows, which Node can only
  // start through a shell. A shell joins arguments with spaces, so quote any
  // that contain spaces or quotes. Real executables (keytool, gh) skip it.
  const shell = isWindows && WINDOWS_SHIMS.has(command)
  const finalArgs = shell ? args.map(quoteForCmd) : args
  const result = spawnSync(command, finalArgs, {
    cwd,
    env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8', ...env },
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
    shell,
  })
  if (result.error) fail(`Could not run ${command}: ${result.error.message}`)
  if (check && result.status !== 0) fail(`${command} ${args.join(' ')} failed (exit code ${result.status})`)
  return result.status
}

/** Runs a command quietly and returns its exit code and trimmed stdout/stderr. */
export function capture(command, args = []) {
  const shell = isWindows && WINDOWS_SHIMS.has(command)
  const result = spawnSync(command, shell ? args.map(quoteForCmd) : args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell,
  })
  return {
    status: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? result.error?.message ?? '').trim(),
  }
}

/** True if a command is on PATH. */
export function hasCommand(command) {
  const probe = spawnSync(isWindows ? 'where' : 'which', [command], { stdio: 'ignore' })
  return probe.status === 0
}

export async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`${question} [y/N] `)
  rl.close()
  return /^(y|yes)$/i.test(answer.trim())
}

function isJdk21(home) {
  const release = home && join(home, 'release')
  return Boolean(release && existsSync(release) && /JAVA_VERSION="21/.test(readFileSync(release, 'utf8')))
}

/**
 * Environment for Gradle: JAVA_HOME pointing at a JDK 21 (Android Studio's
 * bundled one by default) and ANDROID_HOME at the SDK.
 */
export function androidToolchainEnv() {
  const studioJdks = isWindows
    ? ['C:\\Program Files\\Android\\Android Studio\\jbr']
    : isMac
      ? ['/Applications/Android Studio.app/Contents/jbr/Contents/Home']
      : [join(homedir(), 'android-studio', 'jbr'), '/opt/android-studio/jbr']
  const javaHome = isJdk21(process.env.JAVA_HOME) ? process.env.JAVA_HOME : studioJdks.find(isJdk21)
  if (!javaHome) fail('JDK 21 not found. Install Android Studio, or set JAVA_HOME to a JDK 21.')

  const sdkCandidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    isWindows && process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    isMac && join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
  ].filter(Boolean)
  const androidHome = sdkCandidates.find((path) => existsSync(path))
  if (!androidHome) fail('Android SDK not found. Install it from Android Studio, or set ANDROID_HOME.')

  console.log(`JAVA_HOME    = ${javaHome}`)
  console.log(`ANDROID_HOME = ${androidHome}`)
  return { JAVA_HOME: javaHome, ANDROID_HOME: androidHome }
}
