import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import AboutDialog, { AUTHOR_URL, REPO_URL } from './AboutDialog.tsx'

function mount() {
  vi.useFakeTimers()
  const host = document.createElement('div')
  document.body.append(host)
  const [open, setOpen] = createSignal(true)
  const dispose = render(
    () =>
      AboutDialog({
        get open() {
          return open()
        },
        onClose: () => setOpen(false),
      }),
    host,
  )
  const dialog = () => host.querySelector('[role="dialog"]')
  return { host, open, dialog, dispose }
}

describe('AboutDialog', () => {
  afterEach(() => vi.useRealTimers())

  it('shows the credits and a link to the author site', () => {
    const { host, dialog, dispose } = mount()
    expect(dialog()).not.toBeNull()
    expect(host.textContent).toContain('Wiki Scroll')
    expect(host.textContent).toContain('Ian G')
    expect(host.textContent).toContain('with ❤️')
    const link = host.querySelector(`a[href="${AUTHOR_URL}"]`)
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(host.querySelector(`a[href="${REPO_URL}"]`)?.getAttribute('target')).toBe('_blank')
    dispose()
  })

  it('closes from the X button', () => {
    const { host, open, dialog, dispose } = mount()
    host.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click()
    expect(open()).toBe(false)
    vi.advanceTimersByTime(200)
    expect(dialog()).toBeNull()
    dispose()
  })

  it('closes when tapping outside the card, not inside it', () => {
    const { open, dialog, dispose } = mount()
    ;(dialog() as HTMLElement).click()
    expect(open()).toBe(true)
    ;(dialog()!.parentElement as HTMLElement).click()
    expect(open()).toBe(false)
    dispose()
  })

  it('closes on Escape', () => {
    const { open, dispose } = mount()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(open()).toBe(false)
    dispose()
  })
})
