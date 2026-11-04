import { describe, expect, it } from 'vitest'

import { asyncDelegationIds } from '@/lib/chat-messages/hydration'

import {
  type DelegateRow,
  delegateRowsFromCall,
  delegateShortTitle,
  delegateUnitIds,
  settleDelegateRowsFromTranscript
} from './delegate-model'

const parked = (goals: string[]): DelegateRow[] =>
  delegateRowsFromCall({ tasks: goals.map(goal => ({ goal })) }, { status: 'dispatched', goals }, 'call-1')

describe('quiet delegate view', () => {
  it('reads completion ids from async-delegation headers', () => {
    const content = [
      '[ASYNC DELEGATION BATCH COMPLETE — deleg_ab12cd34-2]',
      'A background fan-out unit you dispatched earlier …',
      '[ASYNC DELEGATION TASK FAILED — deleg_ab12cd34, task 3/3]'
    ].join('\n')

    expect(asyncDelegationIds(content)).toEqual(['deleg_ab12cd34-2', 'deleg_ab12cd34#2'])
    expect(asyncDelegationIds('ordinary text')).toEqual([])
  })

  it('maps each task to its unit id, falling back to the call id', () => {
    const result = {
      delegation_id: 'deleg_x',
      units: [
        { delegation_id: 'deleg_x-1', task_indexes: [0] },
        { delegation_id: 'deleg_x-2', task_indexes: [1, 2] }
      ]
    }

    expect(delegateUnitIds(result, 3)).toEqual(['deleg_x-1', 'deleg_x-2', 'deleg_x-2'])
    expect(delegateUnitIds({ delegation_id: 'deleg_y' }, 2)).toEqual(['deleg_y', 'deleg_y'])
  })

  it('settles parked rows from completions in the transcript', () => {
    const result = {
      status: 'dispatched',
      delegation_id: 'deleg_x',
      goals: ['A', 'B', 'C'],
      units: [
        { delegation_id: 'deleg_x-1', task_indexes: [0] },
        { delegation_id: 'deleg_x-2', task_indexes: [1] },
        { delegation_id: 'deleg_x-3', task_indexes: [2] }
      ]
    }

    const rows = parked(['A', 'B', 'C'])

    expect(rows.map(row => row.status)).toEqual(['dispatched', 'dispatched', 'dispatched'])

    const settled = settleDelegateRowsFromTranscript(rows, result, new Set(['deleg_x-1', 'deleg_x#2']))

    expect(settled.map(row => row.status)).toEqual(['completed', 'dispatched', 'failed'])
  })

  it('settles a whole call reported as one batch', () => {
    const result = { status: 'dispatched', delegation_id: 'deleg_z', goals: ['A', 'B'] }
    const settled = settleDelegateRowsFromTranscript(parked(['A', 'B']), result, new Set(['deleg_z']))

    expect(settled.map(row => row.status)).toEqual(['completed', 'completed'])
  })

  it('keeps live terminal states', () => {
    const rows: DelegateRow[] = [{ activity: [], goal: 'A', id: 'a', status: 'failed' }]
    const settled = settleDelegateRowsFromTranscript(rows, { delegation_id: 'deleg_q' }, new Set(['deleg_q']))

    expect(settled[0].status).toBe('failed')
  })

  it('shortens a long self-contained goal to a one-line title', () => {
    expect(delegateShortTitle('Find the three best budget laptops. The user wants under $600, good battery…')).toBe(
      'Find the three best budget laptops'
    )
    expect(delegateShortTitle('## **Fix the login bug**\nDetails follow')).toBe('Fix the login bug')
    expect(delegateShortTitle('x'.repeat(200)).length).toBe(80)
  })
})
