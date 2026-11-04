import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { getHermesConfigRecord } from '@/api/config'
import { useSessionView } from '@/app/chat/session-view'
import { $showReasoning } from '@/store/reasoning-disclosure'
import { profileScopeForSessionOwner } from '@/store/session-request-router'
import { knownOwnerForSession } from '@/store/session-states'
import {
  $displayByOwner,
  $showToolActivity,
  claimOwnerDisplayRefresh,
  ownerDisplayKey,
  releaseOwnerDisplayRefresh,
  setOwnerDisplayFromConfig
} from '@/store/tool-activity'

/** How long an owner's fetched display settings are trusted before a re-read. */
const OWNER_DISPLAY_MAX_AGE_MS = 30_000

interface SessionDisplay {
  /** True when this transcript's owner hides the tool feed (`display.tool_progress: off`). */
  quiet: boolean
  showReasoning: boolean
  showToolActivity: boolean
}

function ownerScopeFor(runtimeId: null | string) {
  const scope = profileScopeForSessionOwner(knownOwnerForSession(runtimeId))

  if (!scope) {
    return null
  }

  return typeof scope === 'string'
    ? { key: ownerDisplayKey(null, scope), scope }
    : { key: ownerDisplayKey(scope.connectionId, scope.profile), scope }
}

/**
 * Display settings for the transcript in view, resolved against the profile
 * that OWNS the session rather than the window's launch profile. Falls back to
 * the window-wide globals until the owner's config has been read (or when the
 * owner can't be resolved), so nothing changes for an ordinary chat.
 */
export function useSessionDisplay(): SessionDisplay {
  const view = useSessionView()
  const runtimeId = useStore(view.$runtimeId)
  const globalTools = useStore($showToolActivity)
  const globalReasoning = useStore($showReasoning)
  const byOwner = useStore($displayByOwner)
  const owner = ownerScopeFor(runtimeId)
  const ownerKey = owner?.key ?? null

  useEffect(() => {
    if (!owner || !claimOwnerDisplayRefresh(owner.key, OWNER_DISPLAY_MAX_AGE_MS)) {
      return
    }

    getHermesConfigRecord(owner.scope)
      .then(record => {
        const display = (record as { display?: Parameters<typeof setOwnerDisplayFromConfig>[1] })?.display
        setOwnerDisplayFromConfig(owner.key, display)
      })
      .catch(() => releaseOwnerDisplayRefresh(owner.key))
    // owner is derived from runtimeId; ownerKey is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey])

  const entry = ownerKey ? byOwner[ownerKey] : undefined
  const showToolActivity = entry ? entry.tools : globalTools
  const showReasoning = entry ? entry.reasoning : globalReasoning

  return { quiet: !showToolActivity, showReasoning, showToolActivity }
}

export const useSessionShowToolActivity = (): boolean => useSessionDisplay().showToolActivity
