import { describe, expect, it } from 'vitest'

import {
  $displayByOwner,
  claimOwnerDisplayRefresh,
  ownerDisplayKey,
  releaseOwnerDisplayRefresh,
  setOwnerDisplayFromConfig
} from './tool-activity'

describe('per-owner display settings', () => {
  it('keys owners by connection and profile', () => {
    expect(ownerDisplayKey(null, 'Dispatcher')).toBe('local|dispatcher')
    expect(ownerDisplayKey('mini', '')).toBe('mini|default')
  })

  it('parses tool_progress and show_reasoning like the globals', () => {
    setOwnerDisplayFromConfig('local|quiet', { show_reasoning: false, tool_progress: 'off' })
    setOwnerDisplayFromConfig('local|loud', { tool_progress: 'all' })
    setOwnerDisplayFromConfig('local|cli', { platforms: { cli: { show_reasoning: false } }, tool_progress: false })

    expect($displayByOwner.get()['local|quiet']).toEqual({ reasoning: false, tools: false })
    expect($displayByOwner.get()['local|loud']).toEqual({ reasoning: true, tools: true })
    expect($displayByOwner.get()['local|cli']).toEqual({ reasoning: false, tools: false })
  })

  it('claims one refresh per window and retries after a failure', () => {
    expect(claimOwnerDisplayRefresh('local|fresh', 1000, 0)).toBe(true)
    expect(claimOwnerDisplayRefresh('local|fresh', 1000, 10)).toBe(false)
    releaseOwnerDisplayRefresh('local|fresh')
    expect(claimOwnerDisplayRefresh('local|fresh', 1000, 20)).toBe(true)
    setOwnerDisplayFromConfig('local|fresh', {})
    expect(claimOwnerDisplayRefresh('local|fresh', 1000, Date.now() + 2000)).toBe(true)
  })
})
