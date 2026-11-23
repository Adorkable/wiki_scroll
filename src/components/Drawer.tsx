import { Show } from 'solid-js'
import { A } from '@solidjs/router'
import { createExitTransition } from '../lib/createExitTransition.ts'
import styles from './Drawer.module.css'

interface DrawerProps {
  open: boolean
  onClose: () => void
  onAbout: () => void
}

/** Must match the exit animation duration in Drawer.module.css. */
const EXIT_MS = 160

export default function Drawer(props: DrawerProps) {
  // Stays true through the exit animation so the panel can slide out before unmounting.
  const mounted = createExitTransition(() => props.open, EXIT_MS)

  return (
    <Show when={mounted()}>
      <div
        class={styles.scrim}
        classList={{ [styles.closing!]: !props.open }}
        onClick={() => props.onClose()}
        aria-hidden="true"
      />
      <nav
        class={styles.panel}
        classList={{ [styles.closing!]: !props.open }}
        aria-label="Main menu"
        inert={!props.open}
      >
        <h2 class={styles.heading}>Wiki Scroll</h2>
        <A href="/settings" class={styles.item} onClick={() => props.onClose()}>
          Settings
        </A>
        <A href="/privacy" class={`${styles.item} ${styles.bottom}`} onClick={() => props.onClose()}>
          Privacy
        </A>
        <button
          type="button"
          class={styles.item}
          onClick={() => {
            props.onClose()
            props.onAbout()
          }}
        >
          About
        </button>
      </nav>
    </Show>
  )
}
