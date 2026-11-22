import { A, useNavigate } from '@solidjs/router'
import AppBar from '../components/AppBar.tsx'
import { followStore } from '../feed/followStore.ts'
import { preferencesStore } from '../feed/preferencesStore.ts'
import styles from './SettingsRoute.module.css'

export default function SettingsRoute() {
  const navigate = useNavigate()

  const summary = () => {
    const count = followStore.followedSiteIds().length
    if (count === 0) return 'None'
    if (count === 1) return '1 wiki'
    return `${count} wikis`
  }

  return (
    <>
      <AppBar title="Settings" leading="back" onLeadingClick={() => navigate('/')} />

      <A href="/settings/wikis" class={styles.row}>
        <span>Wikis</span>
        <span class={styles.rowValue}>{summary()} ›</span>
      </A>

      <label class={styles.row}>
        <span class={styles.rowText}>
          <span>Load summaries</span>
          <span class={styles.rowHint}>Fetches a short description for each article. Uses extra network requests.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          class={styles.switch}
          checked={preferencesStore.loadSummaries()}
          onChange={(event) => preferencesStore.setLoadSummaries(event.currentTarget.checked)}
        />
      </label>
    </>
  )
}
