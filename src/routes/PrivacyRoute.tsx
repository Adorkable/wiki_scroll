import { useNavigate } from '@solidjs/router'
import { AUTHOR_URL, REPO_URL } from '../components/AboutDialog.tsx'
import AppBar from '../components/AppBar.tsx'
import styles from './PrivacyRoute.module.css'

/** Update whenever the policy text changes. */
export const PRIVACY_EFFECTIVE_DATE = 'November 23, 2026'

/**
 * The privacy policy. Also the URL given to the app stores, so it must render
 * on its own when opened directly at /privacy.
 */
export default function PrivacyRoute() {
  const navigate = useNavigate()

  // Opened directly (e.g. from a store listing) there is nothing to go back to.
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'))

  return (
    <>
      {/* The app bar title is the page's h1. */}
      <AppBar title="Privacy Policy" leading="back" onLeadingClick={back} />

      <main class={styles.page}>
        <p class={styles.meta}>Effective {PRIVACY_EFFECTIVE_DATE}</p>

        <p>
          Wiki Scroll does not collect, store or share any personal information. Wiki Scroll uses no accounts, no analytics, no advertising and no tracking.
        </p>

        <h2>What stays on your device</h2>
        <p>
          Your settings are saved only in the app's local storage on your device and are never
          sent anywhere. These settings are:
        </p>
        <ul>
          <li>the wikis and languages you follow</li>
          <li>any wikis you add by URL</li>
          <li>your preferences, such as whether to load summaries</li>
        </ul>
        <p>
          Uninstalling the app deletes these saved settings.
        </p>

        <h2>Wikis you read</h2>
        <p>
          To show articles the app connects directly to the wikis you follow (for example
          Wikipedia) and to any wiki you choose or you add by URL. Like any website
          you visit those wikis receive your IP address and standard request information and
          their own privacy policies apply. For Wikimedia projects that is the{' '}
          <a
            href="https://foundation.wikimedia.org/wiki/Policy:Privacy_policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Wikimedia Foundation Privacy Policy
          </a>
          . Wiki Scroll has no server of its own and does not see what you read.
        </p>
        <p>
          Opening an article on its original site, or a link from the About screen, opens your web
          browser, where that site's policy applies.
        </p>

        <h2>Web version</h2>
        <p>
          The web version of Wiki Scroll's hosting service may keep standard server logs
          (such as IP addresses) to operate and secure the service, as described in the{' '}
          <a
            href="https://vercel.com/legal/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Vercel Privacy Policy
          </a>
          .
        </p>

        <h2>Changes</h2>
        <p>
          If this policy changes, the updated version will be posted here with a new effective
          date.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about privacy can be sent via{' '}
          <a href={AUTHOR_URL + '/contact'} target="_blank" rel="noopener noreferrer">
            iangrossberg.com/contact
          </a>{' '}
          or as an issue on{' '}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          .
        </p>
      </main>
    </>
  )
}
