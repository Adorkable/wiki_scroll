import { describe, expect, it } from 'vitest'
import { render } from 'solid-js/web'
import { MemoryRouter, Route, createMemoryHistory } from '@solidjs/router'
import Drawer from '../components/Drawer.tsx'
import PrivacyRoute from './PrivacyRoute.tsx'

function mountAt(path: string, component: () => unknown) {
  const host = document.createElement('div')
  document.body.append(host)
  const history = createMemoryHistory()
  history.set({ value: path })
  const dispose = render(
    () => MemoryRouter({ history, children: Route({ path, component: component as never }) }),
    host,
  )
  return { host, dispose }
}

describe('PrivacyRoute', () => {
  it('renders the policy when opened directly at /privacy', () => {
    const { host, dispose } = mountAt('/privacy', PrivacyRoute)
    expect(host.querySelectorAll('h1')).toHaveLength(1)
    expect(host.querySelector('h1')?.textContent).toBe('Privacy Policy')
    expect(host.textContent).toContain('does not collect, store or share any personal information')
    dispose()
  })
})

describe('Drawer privacy link', () => {
  it('links to /privacy, directly above About', () => {
    const { host, dispose } = mountAt('/', () =>
      Drawer({ open: true, onClose: () => {}, onAbout: () => {} }),
    )
    const items = [...host.querySelectorAll('nav a, nav button')].map((el) => el.textContent?.trim())
    expect(items.slice(-2)).toEqual(['Privacy', 'About'])
    expect(host.querySelector('nav a[href="/privacy"]')).not.toBeNull()
    dispose()
  })
})
