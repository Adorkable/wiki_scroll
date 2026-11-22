import { Show, createEffect, onCleanup } from 'solid-js'
import { createExitTransition } from '../lib/createExitTransition.ts'
import styles from './AboutDialog.module.css'

interface AboutDialogProps {
  open: boolean
  onClose: () => void
}

export const AUTHOR_URL = 'https://iangrossberg.com'
export const REPO_URL = 'https://github.com/Adorkable/wiki_scroll'

/** Must match the exit animation duration in AboutDialog.module.css. */
const EXIT_MS = 160

export default function AboutDialog(props: AboutDialogProps) {
  const mounted = createExitTransition(() => props.open, EXIT_MS)

  // Escape closes it too, for keyboard users.
  createEffect(() => {
    if (!props.open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose()
    }
    document.addEventListener('keydown', onKey)
    onCleanup(() => document.removeEventListener('keydown', onKey))
  })

  let closeButton: HTMLButtonElement | undefined
  createEffect(() => {
    if (props.open && mounted()) closeButton?.focus()
  })

  return (
    <Show when={mounted()}>
      <div
        class={styles.scrim}
        classList={{ [styles.closing!]: !props.open }}
        // Only a tap on the scrim itself closes; taps inside the card bubble up here too.
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onClose()
        }}
      >
        <div
          class={styles.card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          inert={!props.open}
        >
          <button
            ref={closeButton}
            type="button"
            class={styles.close}
            onClick={() => props.onClose()}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <h2 id="about-title" class={styles.title}>
            Wiki Scroll
          </h2>
          <p class={styles.by}>by</p>
          <p class={styles.author}>Ian G</p>
          <p class={styles.love}>with ❤️</p>

          {/* A real target="_blank" anchor: Capacitor's WebView hands these to
              the system browser, where a scripted window.open can be swallowed. */}
          <a
            class={styles.link}
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open iangrossberg.com"
            title="iangrossberg.com"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
              <path
                d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
              />
            </svg>
          </a>

          <a
            class={styles.link}
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Wiki Scroll on GitHub"
            title="GitHub"
          >
            <svg width="22" height="22" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>

        </div>
      </div>
    </Show>
  )
}
