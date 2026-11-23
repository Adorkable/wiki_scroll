// One-time Google Cloud setup so GitHub Actions can upload to Google Play
// without a stored JSON key (Workload Identity Federation):
//
//   - enables the APIs it needs
//   - creates a service account for Play uploads
//   - creates a workload identity pool + GitHub OIDC provider, restricted to
//     this repository
//   - lets workflows in this repository act as the service account
//
// Safe to re-run: anything that already exists is left alone.
// Needs the gcloud CLI, logged in (gcloud auth login) as a project owner.
//
// Run with: npm run release:gcp-setup <gcp-project-id> [owner/name]
// (or with GCP_PROJECT_ID and GITHUB_REPOSITORY set in fastlane/.env, no arguments).
// `-- --project <id> --repo <owner/name>` also works, but PowerShell swallows the `--`.
import { capture, confirm, fail, hasCommand, heading, parseArgs, readDotEnv, run } from './lib.mjs'

const POOL = 'github'
const PROVIDER = 'github'
const SERVICE_ACCOUNT_NAME = 'play-upload'

const { positional, options } = parseArgs()
const config = readDotEnv()

if (!hasCommand('gcloud')) fail('gcloud CLI not found. Install it from https://cloud.google.com/sdk/docs/install')

const project = options.project ?? positional[0] ?? config.GCP_PROJECT_ID
if (!project) fail('Usage: npm run release:gcp-setup <gcp-project-id> [owner/name]  (or set GCP_PROJECT_ID in fastlane/.env)')

let repo = options.repo ?? positional[1] ?? config.GITHUB_REPOSITORY
if (!repo && hasCommand('gh')) repo = capture('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']).stdout
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) fail('Pass the repo as owner/name, or set GITHUB_REPOSITORY in fastlane/.env.')

const described = capture('gcloud', ['projects', 'describe', project, '--format=value(projectNumber)'])
const projectNumber = described.stdout
if (!projectNumber) {
  fail(
    `Could not read project '${project}'.\n` +
      (described.stderr ? `gcloud said:\n${described.stderr}\n\n` : '') +
      'Check it is the project ID (not the display name) with: gcloud projects list',
  )
}

const serviceAccount = `${SERVICE_ACCOUNT_NAME}@${project}.iam.gserviceaccount.com`
const providerName = `projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}`

console.log(`Project:         ${project} (${projectNumber})
GitHub repo:     ${repo}  (only workflows in this repo will be trusted)
Service account: ${serviceAccount}
Provider:        ${providerName}`)
if (!(await confirm('\nCreate or update these in Google Cloud?'))) {
  console.log('Cancelled.')
  process.exit(1)
}

const exists = (args) => capture('gcloud', [...args, `--project=${project}`]).status === 0

heading('Enabling APIs (Play Developer, IAM, IAM Credentials, STS)')
// iam.googleapis.com is required for workload identity pools; without it
// Google reports PERMISSION_DENIED rather than "API not enabled".
run('gcloud', [
  'services', 'enable',
  'androidpublisher.googleapis.com', 'iam.googleapis.com', 'iamcredentials.googleapis.com', 'sts.googleapis.com',
  `--project=${project}`,
])

heading('Service account')
if (exists(['iam', 'service-accounts', 'describe', serviceAccount])) {
  console.log(`${serviceAccount} already exists`)
} else {
  run('gcloud', [
    'iam', 'service-accounts', 'create', SERVICE_ACCOUNT_NAME,
    '--display-name=Google Play upload (GitHub Actions)', `--project=${project}`,
  ])
}

heading('Workload identity pool')
if (exists(['iam', 'workload-identity-pools', 'describe', POOL, '--location=global'])) {
  console.log(`Pool '${POOL}' already exists`)
} else {
  run('gcloud', [
    'iam', 'workload-identity-pools', 'create', POOL,
    '--location=global', '--display-name=GitHub Actions', `--project=${project}`,
  ])
}

heading('GitHub OIDC provider')
if (exists(['iam', 'workload-identity-pools', 'providers', 'describe', PROVIDER, '--location=global', `--workload-identity-pool=${POOL}`])) {
  console.log(`Provider '${PROVIDER}' already exists (its repository condition is not changed on re-runs)`)
} else {
  run('gcloud', [
    'iam', 'workload-identity-pools', 'providers', 'create-oidc', PROVIDER,
    '--location=global', `--workload-identity-pool=${POOL}`,
    '--display-name=GitHub', '--issuer-uri=https://token.actions.githubusercontent.com',
    '--attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository',
    `--attribute-condition=assertion.repository=='${repo}'`,
    `--project=${project}`,
  ])
}

heading('Letting this repository act as the service account')
run('gcloud', [
  'iam', 'service-accounts', 'add-iam-policy-binding', serviceAccount,
  '--role=roles/iam.workloadIdentityUser',
  `--member=principalSet://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${repo}`,
  `--project=${project}`,
  '--condition=None',
])

console.log(`
Done. Now:
  1. Play Console > Users and permissions > Invite new users:
       ${serviceAccount}
     Give it Wiki Scroll with "Release to production..." and "Release apps to
     testing tracks". Permissions can take a while to take effect.
  2. In fastlane/.env set:
       GCP_WORKLOAD_IDENTITY_PROVIDER=${providerName}
       GCP_SERVICE_ACCOUNT=${serviceAccount}
     then run: npm run release:secrets android`)
