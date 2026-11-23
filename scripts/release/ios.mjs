// iOS release tasks. macOS only; reads settings from fastlane/.env.
//
//   npm run ios:certificates   one-time: create the distribution cert + profile in the match repo
//   npm run ios:beta           build, sign and upload to TestFlight from this Mac
import { fail, heading, isMac, parseArgs, requireDotEnv, run } from './lib.mjs'

const { positional } = parseArgs()
const lane = positional[0]
if (lane !== 'certificates' && lane !== 'beta') fail('Usage: ios.mjs certificates|beta')
if (!isMac) fail('iOS builds need macOS and Xcode.')

const config = requireDotEnv()
for (const key of ['APPLE_TEAM_ID', 'APP_STORE_CONNECT_API_KEY_ID', 'APP_STORE_CONNECT_ISSUER_ID', 'MATCH_GIT_URL']) {
  if (!config[key]) fail(`${key} is not set in fastlane/.env.`)
}

if (lane === 'certificates') {
  heading('fastlane ios certificates')
  run('bundle', ['exec', 'fastlane', 'ios', 'certificates'])
  process.exit(0)
}

heading('Building the web app')
run('npm', ['run', 'build'])

heading('Syncing into the iOS project')
run('npx', ['cap', 'sync', 'ios'])

heading('fastlane ios beta')
// The beta lane switches the project to manual signing for the build. Put the
// committed project file back afterwards, even if the build fails.
const status = run('bundle', ['exec', 'fastlane', 'ios', 'beta'], { check: false })
run('git', ['checkout', '--', 'ios/App/App.xcodeproj/project.pbxproj'], { check: false })
if (status !== 0) fail(`fastlane ios beta failed (exit code ${status})`)
