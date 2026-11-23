# Releasing

Builds run on GitHub Actions with [fastlane](https://fastlane.tools). The same
lanes can run locally through the scripts below.

- `.github/workflows/ci.yml` runs the tests and a web build on every push and PR.
- `.github/workflows/release.yml` builds and uploads both apps.
- `fastlane/Fastfile` holds the build steps: `android build`, `android deploy`,
  `ios certificates` and `ios beta`.

## Local tools

Local settings live in `fastlane/.env` (copied from `fastlane/.env.example`,
git-ignored, loaded by fastlane automatically). Key files go in `secrets/`,
which is also git-ignored.

| Command | What it does |
| --- | --- |
| `npm run release:setup` | Installs fastlane (into `vendor/bundle`) and creates `fastlane/.env` |
| `npm run android:keystore` | Creates the Android upload key in `secrets/` |
| `npm run android:build [version-code]` | Builds a signed release AAB locally, no upload (version code defaults to 1) |
| `npm run android:deploy [track]` | Builds and uploads to Google Play (track defaults to `PLAY_TRACK`, then `internal`) |
| `npm run ios:certificates` | macOS only, once: creates the distribution certificate and profile (or run the **iOS certificates** workflow instead) |
| `npm run ios:beta` | macOS only: builds and uploads to TestFlight from this Mac |
| `npm run release:secrets [android\|ios]` | Copies `fastlane/.env` into the repo's GitHub Actions secrets and variables (needs `gh`) |
| `npm run release:gcp-setup <project> [owner/repo]` | One-time keyless Google Play access for CI (needs `gcloud`) |

Options are plain positional arguments, so they work the same in PowerShell,
cmd and bash. (PowerShell swallows the `--` that npm normally needs before
`--flag` style options.)

The scripts are plain Node in `scripts/release/` and work the same on Windows
and macOS. They need Ruby (Windows: Ruby+Devkit from
[RubyInstaller](https://rubyinstaller.org)) and, for Android, Android Studio,
whose bundled JDK 21 and SDK they find automatically.

## Cutting a release

1. Bump `version` in `package.json` (and `package-lock.json`, e.g. with
   `npm version 1.1.0 --no-git-tag-version`) and commit.
2. Tag and push:

   ```bash
   git tag v1.1.0
   git push origin v1.1.0
   ```

   The workflow refuses to run if the tag and `package.json` disagree.

Android goes to the Play **internal** track and iOS goes to **TestFlight**;
promote to production from the Play Console and App Store Connect. To release
only one platform, run **Release** by hand from the Actions tab.

Version names come from `package.json`. Build numbers are worked out
automatically: one more than the highest already uploaded to each store.

## One-time setup

Add each value below under **Settings → Secrets and variables → Actions** in
the GitHub repo.

### Android

1. **Set up locally:** `npm install`, then `npm run release:setup`
2. **Create the upload key:** `npm run android:keystore`, then fill in the
   Android signing section of `fastlane/.env`. Back the keystore up; losing it
   means asking Google to reset your upload key.
3. **Check it builds:** `npm run android:build` prints the path of a
   signed `.aab`.
4. **Create the app** in the [Play Console](https://play.google.com/console)
   with package name `com.adorkable.wikiscroll`.
5. **Upload that first `.aab` by hand** to the internal testing track. Google's
   API cannot create an app's first release. Enrol in Play App Signing when
   asked.
6. **Set up keyless Google Play access for CI** (Workload Identity
   Federation, so no JSON key exists anywhere). Install the
   [gcloud CLI](https://cloud.google.com/sdk/docs/install), run
   `gcloud auth login`, create or pick a Google Cloud project, then:

   ```bash
   npm run release:gcp-setup <gcp-project-id> <owner>/<repo>
   ```

   It enables the APIs, creates a `play-upload` service account, and trusts
   GitHub Actions from **that repo only** to act as it. It prints two values
   for `fastlane/.env`: `GCP_WORKLOAD_IDENTITY_PROVIDER` and
   `GCP_SERVICE_ACCOUNT`. Re-running it is safe.
7. **Give the service account access in Play:** Play Console → **Users and
   permissions** → **Invite new users** → the service account's email → add
   Wiki Scroll with *Release to production…* and *Release apps to testing
   tracks*. New permissions can take a while to take effect.
8. **Send the settings to GitHub:** `npm run release:secrets android`
   sets these from `fastlane/.env`:

   | Name | Kind | Value |
   | --- | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | secret | the keystore file, base64-encoded |
   | `ANDROID_KEYSTORE_PASSWORD` | secret | keystore password |
   | `ANDROID_KEY_ALIAS` | secret | key alias |
   | `ANDROID_KEY_PASSWORD` | secret | key password |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER` | variable | from step 6 |
   | `GCP_SERVICE_ACCOUNT` | variable | from step 6 |
   | `PLAY_TRACK`, `PLAY_RELEASE_STATUS` | variable | optional, only if set |

   `PLAY_TRACK` defaults to `internal` and `PLAY_RELEASE_STATUS` to
   `completed`. Set `PLAY_RELEASE_STATUS=draft` until the app has passed its
   first review; Google rejects anything else on an unpublished app.

**Deploying from your own machine** (`npm run android:deploy`) needs no key
either. Sign in once with an account that has release access in the Play
Console:

```bash
gcloud auth application-default login --scopes=openid,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/androidpublisher
```

If you prefer a downloaded service account key, set
`PLAY_SERVICE_ACCOUNT_JSON_PATH` in `fastlane/.env` and fastlane uses that
instead.

### iOS

Requires a paid Apple Developer Program membership. **No Mac is needed:** the
one-time certificate step runs on a GitHub macOS runner.

1. **Join the [Apple Developer Program](https://developer.apple.com/programs/enroll/)**
   (US$99/year; as an individual or as an organisation, which needs a D-U-N-S
   number). Approval can take a day or two.
2. **Register the bundle ID:** [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list)
   → Identifiers → **+** → App IDs → App → description "Wiki Scroll",
   *Explicit* bundle ID `com.adorkable.wikiscroll`. No capabilities needed.
3. **Create the app record:** [App Store Connect](https://appstoreconnect.apple.com)
   → Apps → **+** → New App → platform iOS, name "Wiki Scroll" (must be unique
   on the App Store), primary language, the bundle ID from step 2, and any
   unique SKU such as `wiki-scroll`.
4. **Create an App Store Connect API key:** Users and Access → Integrations →
   App Store Connect API → Team Keys → **+**, role **Admin** (creating signing
   certificates needs it). Download the `.p8` to `secrets/AuthKey.p8`; Apple
   only allows one download. Note the **Key ID** and the **Issuer ID** shown
   above the key list. Your **Team ID** is under Membership details on
   developer.apple.com.
5. **Create an empty private repo** for the encrypted signing files:

   ```bash
   gh repo create Adorkable/wiki_scroll-certificates --private
   ```

6. **Create a GitHub token** for it: a fine-grained personal access token
   limited to that one repo with *Contents: Read and write* (write is needed
   once, in step 9).
7. **Fill in the iOS section of `fastlane/.env`:** `APPLE_TEAM_ID`,
   `APP_STORE_CONNECT_API_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`,
   `MATCH_GIT_URL=https://github.com/Adorkable/wiki_scroll-certificates.git`,
   `MATCH_GIT_USERNAME`, `MATCH_GIT_TOKEN`, and a new random
   `MATCH_PASSWORD` that encrypts the signing files. Generate one with
   `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`
   and keep a copy somewhere safe.
8. **Send the secrets to GitHub:** `npm run release:secrets ios`
   sets:

   | Secret | Value |
   | --- | --- |
   | `APPLE_TEAM_ID` | 10-character team ID (Membership details) |
   | `APP_STORE_CONNECT_API_KEY_ID` | key ID |
   | `APP_STORE_CONNECT_ISSUER_ID` | issuer ID (top of the API keys page) |
   | `APP_STORE_CONNECT_API_KEY_P8` | full contents of the `.p8` file |
   | `MATCH_GIT_URL` | HTTPS URL of the certificates repo |
   | `MATCH_PASSWORD` | the match passphrase |
   | `MATCH_GIT_BASIC_AUTHORIZATION` | `username:token`, base64-encoded |

9. **Create the certificate and profile:** push your changes, then GitHub →
   Actions → **iOS certificates** → Run workflow (or
   `gh workflow run ios-certificates.yml` then `gh run watch`). It creates an
   App Store distribution certificate and profile and commits them, encrypted,
   to the certificates repo. On a Mac, `npm run ios:certificates` does the same.
10. **Optional:** reduce the token to *Contents: Read-only*; releases only
    read the certificates repo. Re-run step 9 (with write access) when the
    certificate expires, roughly yearly.
11. **First TestFlight build:** Actions → **Release** → Run workflow → `ios`.
    The build appears in App Store Connect → TestFlight after Apple finishes
    processing it (typically 5–30 minutes). Add yourself under *Internal
    Testing* and install it with the TestFlight app.

Before submitting for App Store review, App Store Connect also needs the
store listing (description, keywords, support URL, privacy policy URL),
screenshots (6.9" iPhone at minimum, plus iPad because the app supports it),
the age rating questionnaire, and App Privacy answers ("Data Not Collected").

## Cost

On a public repo, GitHub's standard Linux and macOS runners are free. On a
private repo, macOS minutes are billed against the account's allowance and run
out quickly.
