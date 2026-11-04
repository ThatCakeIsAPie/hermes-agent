import { atom, map } from 'nanostores'

// Mirrors `display.tool_progress`, independent of `display.show_reasoning`:
// hiding thinking must not hide the work. Answer-only is both keys off.
// Parsing matches the gateway's `_load_tool_progress_mode` so the renderer and
// the event stream agree: only false / "off" silence tool rows; every other
// mode (all, new, verbose, unknown, missing) keeps them on.
export const $showToolActivity = atom(true)

export function toolProgressVisible(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }

  return !(typeof value === 'string' && value.trim().toLowerCase() === 'off')
}

export function setShowToolActivityFromConfig(value: unknown): void {
  $showToolActivity.set(toolProgressVisible(value))
}

// ── Per-owner display (each Bot keeps its own visibility) ────────────────────
//
// The globals above follow the window's active gateway profile. A Bot's chat
// is a session OWNED by another profile, so its transcript follows that
// profile's own `display.tool_progress` / `display.show_reasoning` instead:
// a quiet "front desk" Bot stays quiet even when opened from a window whose
// launch profile shows every tool call.

export interface OwnerDisplay {
  reasoning: boolean
  tools: boolean
}

/** Keyed by {@link ownerDisplayKey}. Missing = not fetched yet (callers fall back to the globals). */
export const $displayByOwner = map<Record<string, OwnerDisplay>>({})

const fetchedAt = new Map<string, number>()

export function ownerDisplayKey(connectionId: null | string | undefined, profile: null | string | undefined): string {
  const connection = String(connectionId ?? '').trim() || 'local'
  const name = String(profile ?? '').trim().toLowerCase() || 'default'

  return `${connection}|${name}`
}

export function reasoningVisible(value: unknown): boolean {
  return !(value === false || value === 'false' || value === 0)
}

interface DisplayConfigLike {
  platforms?: { cli?: { show_reasoning?: unknown } }
  show_reasoning?: unknown
  tool_progress?: unknown
}

export function setOwnerDisplayFromConfig(key: string, display: DisplayConfigLike | null | undefined): void {
  $displayByOwner.setKey(key, {
    reasoning: reasoningVisible(display?.platforms?.cli?.show_reasoning ?? display?.show_reasoning),
    tools: toolProgressVisible(display?.tool_progress)
  })
  fetchedAt.set(key, Date.now())
}

/** True when `key` has no entry, or one older than `maxAgeMs`. Marks the key as
 *  in flight so concurrent renders don't each fire a request. */
export function claimOwnerDisplayRefresh(key: string, maxAgeMs: number, now = Date.now()): boolean {
  const last = fetchedAt.get(key)

  if (last !== undefined && now - last < maxAgeMs) {
    return false
  }

  fetchedAt.set(key, now)

  return true
}

/** Undo a {@link claimOwnerDisplayRefresh} whose request failed, so the next render retries. */
export function releaseOwnerDisplayRefresh(key: string): void {
  if (!$displayByOwner.get()[key]) {
    fetchedAt.delete(key)
  }
}
