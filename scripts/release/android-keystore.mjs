// Creates the Android upload key that signs builds for Google Play. Run once.
// keytool asks for a password and your name/organisation.
//
// Run with: npm run android:keystore [path] [alias]
// Defaults: secrets/upload.keystore, alias "upload".
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { androidToolchainEnv, fail, heading, parseArgs, repoPath, run } from './lib.mjs'

const { positional, options } = parseArgs()
const path = options.path ?? positional[0] ?? 'secrets/upload.keystore'
const alias = options.alias ?? positional[1] ?? 'upload'

const keystore = repoPath(path)
if (existsSync(keystore)) fail(`${keystore} already exists. Refusing to overwrite an existing signing key.`)
mkdirSync(dirname(keystore), { recursive: true })

const { JAVA_HOME } = androidToolchainEnv()
const keytool = join(JAVA_HOME, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool')

heading(`Creating ${keystore}`)
run(keytool, ['-genkeypair', '-v', '-keystore', keystore, '-alias', alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'])

console.log(`
Created ${keystore} (alias '${alias}').
Now:
  - In fastlane/.env set:
      ANDROID_KEYSTORE_PATH=${path}
      ANDROID_KEY_ALIAS=${alias}
      ANDROID_KEYSTORE_PASSWORD=<the password you just entered>
      ANDROID_KEY_PASSWORD=<the same password>
    keytool's default keystore format (PKCS12) has a single password, so the
    key password is always the keystore password.
  - Back up the keystore and its password outside this folder. Losing it means
    asking Google to reset your upload key.`)
