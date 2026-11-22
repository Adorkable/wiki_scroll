import { createEffect, createSignal, on, onCleanup } from 'solid-js'

/**
 * Keeps an element mounted for `exitMs` after `open` turns false, so its exit
 * animation can play before it is removed. `exitMs` must match the CSS
 * animation duration.
 */
export function createExitTransition(open: () => boolean, exitMs: number): () => boolean {
  const [mounted, setMounted] = createSignal(open())
  let exitTimer: ReturnType<typeof setTimeout> | undefined

  createEffect(
    on(
      open,
      (isOpen) => {
        clearTimeout(exitTimer)
        if (isOpen) {
          setMounted(true)
        } else if (mounted()) {
          exitTimer = setTimeout(() => setMounted(false), exitMs)
        }
      },
      { defer: true },
    ),
  )

  onCleanup(() => clearTimeout(exitTimer))

  return mounted
}
