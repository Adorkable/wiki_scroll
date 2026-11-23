// Builds the web app, syncs it into the Android project, and runs a fastlane
// Android lane with the settings in fastlane/.env.
//
//   npm run android:build              signed release AAB, no upload (version code 1)
//   npm run android:build 5            ...with version code 5
//   npm run android:deploy             build and upload to Google Play (PLAY_TRACK or internal)
//   npm run android:deploy beta        ...to the beta track
// (`-- --version-code 5` / `-- --track beta` also work outside PowerShell.)
import { existsSync } from 'node:fs'
import { androidToolchainEnv, fail, heading, parseArgs, repoPath, requireDotEnv, run } from './lib.mjs'

const { positional, options } = parseArgs()
const lane = positional[0]
if (lane !== 'build' && lane !== 'deploy') fail('Usage: android.mjs build|deploy')

const config = requireDotEnv()
for (const key of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD']) {
  if (!config[key]) fail(`${key} is not set in fastlane/.env.`)
}
if (!existsSync(repoPath(config.ANDROID_KEYSTORE_PATH))) {
  fail(`Keystore not found at ${config.ANDROID_KEYSTORE_PATH}. Run: npm run android:keystore`)
}
if (lane === 'deploy') {
  const json = config.PLAY_SERVICE_ACCOUNT_JSON_PATH
  if (json && !existsSync(repoPath(json))) {
    fail(`PLAY_SERVICE_ACCOUNT_JSON_PATH points at ${json}, which does not exist.`)
  }
  if (!json) {
    // fastlane falls back to Application Default Credentials.
    console.log(
      'No PLAY_SERVICE_ACCOUNT_JSON_PATH set; using your gcloud Application Default Credentials.\n' +
        'If the upload says it cannot load credentials, run once:\n' +
        '  gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/androidpublisher',
    )
  }
}

const env = androidToolchainEnv()

heading('Building the web app')
run('npm', ['run', 'build'])

heading('Syncing into the Android project')
run('npx', ['cap', 'sync', 'android'])

// fastlane loads fastlane/.env itself, so only lane options are passed here.
const laneArgs = []
if (lane === 'build') laneArgs.push(`version_code:${options['version-code'] ?? positional[1] ?? 1}`)
const track = options.track ?? positional[1]
if (lane === 'deploy' && track) laneArgs.push(`track:${track}`)

heading(`fastlane android ${lane}`)
run('bundle', ['exec', 'fastlane', 'android', lane, ...laneArgs], { env })
