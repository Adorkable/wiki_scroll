// Copies the release settings from fastlane/.env (and the key files it points
// to) into the GitHub repo's Actions secrets and variables, using the GitHub
// CLI. Values are piped to `gh` on stdin, so they never appear on a command line.
// Lists what it will set and asks before writing anything.
//
//   npm run release:secrets                      both platforms
//   npm run release:secrets android              one platform
//   npm run release:secrets ios Adorkable/wiki_scroll
// (`-- --platform android --repo owner/name` also works outside PowerShell.)
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { confirm, fail, hasCommand, parseArgs, repoPath, requireDotEnv, run } from './lib.mjs'

const { positional, options } = parseArgs()
const platform = options.platform ?? positional[0] ?? 'both'
if (!['android', 'ios', 'both'].includes(platform)) fail('Platform must be android, ios or both')
options.repo ??= positional[1]

if (!hasCommand('gh')) fail('GitHub CLI (gh) is not installed.')
if (spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' }).status !== 0) {
  fail('Not logged in to GitHub. Run: gh auth login')
}

const config = requireDotEnv()
const secrets = new Map()
// Not sensitive, so stored as plain repo variables (visible in the workflow log).
const variables = new Map()
const missing = []

function addVariable(name) {
  if (config[name]) variables.set(name, config[name])
  else missing.push(`${name} (variable)`)
}

function addValue(name, key = name) {
  if (config[key]) secrets.set(name, config[key])
  else missing.push(name)
}

function addFile(name, pathKey, encoding) {
  const path = config[pathKey]
  if (path && existsSync(repoPath(path))) secrets.set(name, readFileSync(repoPath(path)).toString(encoding))
  else missing.push(`${name} (file from ${pathKey})`)
}

if (platform !== 'ios') {
  addFile('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PATH', 'base64')
  addValue('ANDROID_KEYSTORE_PASSWORD')
  addValue('ANDROID_KEY_ALIAS')
  addValue('ANDROID_KEY_PASSWORD')
  addVariable('GCP_WORKLOAD_IDENTITY_PROVIDER')
  addVariable('GCP_SERVICE_ACCOUNT')
  for (const name of ['PLAY_TRACK', 'PLAY_RELEASE_STATUS']) {
    if (config[name]) variables.set(name, config[name])
  }
}

if (platform !== 'android') {
  addValue('APPLE_TEAM_ID')
  addValue('APP_STORE_CONNECT_API_KEY_ID')
  addValue('APP_STORE_CONNECT_ISSUER_ID')
  addFile('APP_STORE_CONNECT_API_KEY_P8', 'APP_STORE_CONNECT_API_KEY_PATH', 'utf8')
  addValue('MATCH_GIT_URL')
  addValue('MATCH_PASSWORD')
  if (config.MATCH_GIT_USERNAME && config.MATCH_GIT_TOKEN) {
    const pair = `${config.MATCH_GIT_USERNAME}:${config.MATCH_GIT_TOKEN}`
    secrets.set('MATCH_GIT_BASIC_AUTHORIZATION', Buffer.from(pair, 'utf8').toString('base64'))
  } else {
    missing.push('MATCH_GIT_BASIC_AUTHORIZATION (MATCH_GIT_USERNAME + MATCH_GIT_TOKEN)')
  }
}

const repo =
  options.repo ??
  config.GITHUB_REPOSITORY ??
  (spawnSync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], {
    encoding: 'utf8',
  }).stdout ?? '').trim()
if (!repo) fail('Could not detect the GitHub repo. Pass --repo owner/name.')

console.log(`Repository: ${repo}`)
if (secrets.size > 0) {
  console.log('\nSecrets:')
  for (const name of secrets.keys()) console.log(`  ${name}`)
}
if (variables.size > 0) {
  console.log('\nVariables:')
  for (const [name, value] of variables) console.log(`  ${name} = ${value}`)
}
if (missing.length > 0) {
  console.log('\nSkipping (not configured in fastlane/.env):')
  for (const name of missing) console.log(`  ${name}`)
}
const total = secrets.size + variables.size
if (total === 0) {
  console.log('\nNothing to set.')
  process.exit(0)
}

if (!(await confirm(`\nWrite these ${total} values to ${repo}?`))) {
  console.log('Cancelled.')
  process.exit(1)
}

for (const [name, value] of secrets) {
  run('gh', ['secret', 'set', name, '--repo', repo], { input: value })
  console.log(`  secret   ${name}`)
}
for (const [name, value] of variables) {
  run('gh', ['variable', 'set', name, '--repo', repo], { input: value })
  console.log(`  variable ${name}`)
}
console.log('\nDone.')
