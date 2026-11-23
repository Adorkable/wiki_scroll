// One-time local setup for building and releasing: fastlane (installed into
// vendor/bundle) and a fastlane/.env to fill in.
//
// Run with: npm run release:setup
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ENV_EXAMPLE, ENV_FILE, REPO_ROOT, fail, hasCommand, heading, run } from './lib.mjs'

for (const tool of ['ruby', 'bundle']) {
  if (!hasCommand(tool)) {
    fail(`'${tool}' is not on PATH. Install Ruby (Windows: RubyInstaller with Devkit), then restart your terminal.`)
  }
}

heading('Keeping Ruby gems inside the project (vendor/bundle)')
run('bundle', ['config', 'set', '--local', 'path', 'vendor/bundle'])

heading('Installing fastlane')
run('bundle', ['install'])

mkdirSync(join(REPO_ROOT, 'secrets'), { recursive: true })

if (existsSync(ENV_FILE)) {
  console.log('\nfastlane/.env already exists; left unchanged.')
} else {
  copyFileSync(ENV_EXAMPLE, ENV_FILE)
  console.log('\nCreated fastlane/.env from the template.')
}

console.log(`
Setup complete. Next:
  1. Android key:  npm run android:keystore   (once; then fill in fastlane/.env)
  2. Test build:   npm run android:build
  3. CI secrets:   npm run release:secrets
See RELEASING.md for the full walkthrough.`)
