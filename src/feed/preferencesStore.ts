import { createSignal } from 'solid-js'

export const PREFERENCES_STORAGE_KEY = 'wiki-scroll.preferences.v1'

export interface Preferences {
  /**
   * Whether the feed fetches article summaries. Each loaded batch costs one
   * extra request per followed wiki, so this is off unless the reader opts in.
   */
  loadSummaries: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  loadSummaries: false,
}

export interface PreferencesStore {
  loadSummaries: () => boolean
  setLoadSummaries: (enabled: boolean) => void
  /** Returns an unsubscribe function. */
  onChange: (listener: () => void) => () => void
}

/** Reads stored preferences defensively; a corrupt value falls back to defaults. */
function readStored(): Preferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (raw === null) return { ...DEFAULT_PREFERENCES }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFERENCES }
    const loadSummaries = (parsed as Record<string, unknown>).loadSummaries
    return {
      loadSummaries:
        typeof loadSummaries === 'boolean' ? loadSummaries : DEFAULT_PREFERENCES.loadSummaries,
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

function writeStored(preferences: Preferences): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // An unavailable quota only means the choice will not survive a relaunch.
  }
}

export function createPreferencesStore(): PreferencesStore {
  const [preferences, setPreferences] = createSignal<Preferences>(readStored())
  const listeners = new Set<() => void>()

  return {
    loadSummaries: () => preferences().loadSummaries,

    setLoadSummaries(enabled) {
      if (preferences().loadSummaries === enabled) return
      const next = { ...preferences(), loadSummaries: enabled }
      setPreferences(next)
      writeStored(next)
      for (const listener of listeners) listener()
    },

    onChange(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The app's one preferences store. */
export const preferencesStore = createPreferencesStore()
