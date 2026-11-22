import { beforeEach, describe, expect, it } from 'vitest'
import { createPreferencesStore, PREFERENCES_STORAGE_KEY } from './preferencesStore.ts'

describe('createPreferencesStore', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to not loading summaries', () => {
    expect(createPreferencesStore().loadSummaries()).toBe(false)
  })

  it('persists the choice and notifies listeners', () => {
    const store = createPreferencesStore()
    let notified = 0
    store.onChange(() => notified++)

    store.setLoadSummaries(true)

    expect(store.loadSummaries()).toBe(true)
    expect(notified).toBe(1)
    expect(createPreferencesStore().loadSummaries()).toBe(true)
  })

  it('does not notify when the value is unchanged', () => {
    const store = createPreferencesStore()
    let notified = 0
    store.onChange(() => notified++)
    store.setLoadSummaries(false)
    expect(notified).toBe(0)
  })

  it('falls back to defaults on corrupt storage', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, '{not json')
    expect(createPreferencesStore().loadSummaries()).toBe(false)
  })
})
