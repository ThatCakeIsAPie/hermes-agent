'use client'

import { useStore } from '@nanostores/react'
import { type FC, type ReactNode, useMemo } from 'react'

import { useSessionView } from '@/app/chat/session-view'
import { useElapsedSeconds } from '@/components/chat/activity-timer'
import { ActivityTimerText } from '@/components/chat/activity-timer-text'
import { SCAFFOLD_GLYPH_CLASS, SCAFFOLD_LABEL_CLASS, SCAFFOLD_META_CLASS } from '@/components/chat/scaffold-row'
import { Codicon } from '@/components/ui/codicon'
import { FadeText } from '@/components/ui/fade-text'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { useI18n } from '@/i18n'
import { AlertCircle, CheckCircle2 } from '@/lib/icons'
import { displayModelName } from '@/lib/model-status-label'
import { useSessionDisplay } from '@/lib/use-session-display'
import { useSessionSlice } from '@/lib/use-session-slice'
import { cn } from '@/lib/utils'
import { $subagentsBySession } from '@/store/subagents'
import { openSessionInNewWindow } from '@/store/windows'

import {
  type DelegateRow,
  delegateRowsFromCall,
  type DelegateRowStatus,
  delegateShortTitle,
  isDelegateRowLive,
  mergeDelegateRows,
  settleDelegateRowsFromTranscript
} from './delegate-model'
import { formatDurationSeconds, type ToolPart } from './fallback-model'
import { ToolRunTicker } from './run-ticker'

// Activity lines kept mounted behind the visible one. Enough for the reel to
// read as motion, few enough that a chatty child doesn't hold a hundred rows
// in the DOM per subagent.
const TICKER_DEPTH = 6

function statusGlyph(status: DelegateRowStatus, label: string): ReactNode {
  if (isDelegateRowLive(status)) {
    return (
      <GlyphSpinner ariaLabel={label} className="size-3.5 text-[0.95rem] text-(--ui-text-tertiary)" spinner="breathe" />
    )
  }

  if (status === 'failed' || status === 'interrupted') {
    return <AlertCircle aria-label={label} className="size-3.5 text-destructive" />
  }

  if (status === 'dispatched') {
    // Parked, not watched: the children outlived the turn that spawned them
    // and nothing in this transcript is streaming their progress. A spinner
    // here would claim a liveness we can't back up.
    return <span aria-hidden className="size-1.5 rounded-full bg-(--ui-text-tertiary)" />
  }

  return <CheckCircle2 aria-label={label} className="size-3.5 text-emerald-600/85 dark:text-emerald-400/85" />
}

/**
 * One delegated child: who it is on the first line, what it is doing on the
 * second.
 *
 * The title carries the goal and the model running it — the two things that
 * identify a child you didn't dispatch yourself — with the elapsed time
 * trailing while it works. Underneath, a single ticking line of its relayed
 * activity, so a fan-out of five children costs ten lines of transcript
 * whatever they get up to.
 */
function DelegateRowView({ row }: { row: DelegateRow }) {
  const parentSessionId = useStore(useSessionView().$storedId)
  const { t } = useI18n()
  const copy = t.assistant.tool
  const { sessionId } = row
  const live = isDelegateRowLive(row.status)
  const elapsed = useElapsedSeconds(live, `delegate:${row.id}`)
  const activity = row.activity.slice(-TICKER_DEPTH)

  const statusLabel = live
    ? copy.statusRunning
    : row.status === 'failed' || row.status === 'interrupted'
      ? copy.statusError
      : copy.statusDone

  const meta = [
    row.model ? displayModelName(row.model) : '',
    !live && row.durationSeconds ? formatDurationSeconds(row.durationSeconds) : ''
  ].filter(Boolean)

  // Only a child that reported its own session id has somewhere to go.
  const open = sessionId ? () => void openSessionInNewWindow(sessionId, { watch: true, parentSessionId }) : undefined

  // The scaffold mark goes on the goal row, NEVER on this wrapper: it fades to
  // 0.67, and opacity opens a stacking context around the ticker's transformed
  // reel, which is how old activity lines painted through the one-line window
  // and the whole card read as stacked ghosts (#105579). styles.css's own
  // invariant: the mark is per surface and never on a container.
  return (
    <div className="grid min-w-0 max-w-full gap-0.5 rounded-xl border border-(--ui-stroke-tertiary) px-3 py-2">
      <div className="flex min-w-0 max-w-full items-center gap-1.5" data-conversation-scaffold="">
        <span className={SCAFFOLD_GLYPH_CLASS}>{statusGlyph(row.status, statusLabel)}</span>
        <button
          className={cn(
            SCAFFOLD_LABEL_CLASS,
            'min-w-0 truncate text-left transition-colors',
            open ? 'hover:text-foreground focus-visible:text-foreground' : 'cursor-default'
          )}
          disabled={!open}
          onClick={open}
          type="button"
        >
          {row.goal}
        </button>
        {meta.length > 0 && <span className={SCAFFOLD_META_CLASS}>{meta.join(' · ')}</span>}
        {live && <ActivityTimerText className={cn(SCAFFOLD_META_CLASS, 'ml-auto')} seconds={elapsed} />}
        <Codicon className="ml-auto shrink-0 text-(--conversation-scaffold-text)" name="agent" size="0.625rem" />
      </div>
      {activity.length > 0 && (
        <div className="min-w-0 max-w-full pl-5">
          <ToolRunTicker>
            {activity.map((text, index) => (
              <FadeText
                className={cn(SCAFFOLD_LABEL_CLASS, 'text-(--conversation-scaffold-meta)', live && 'shimmer')}
                key={`${row.id}:${index}`}
              >
                {text}
              </FadeText>
            ))}
          </ToolRunTicker>
        </div>
      )}
    </div>
  )
}

/**
 * One child in a quiet transcript: a single line that reads "Working on: …"
 * until the child settles, then "Done: …". No model, timer, ticker or link —
 * the owner chose not to show the machinery, only that work is under way.
 */
function QuietDelegateRowView({ row }: { row: DelegateRow }) {
  const { t } = useI18n()
  const copy = t.assistant.tool
  const working = isDelegateRowLive(row.status) || row.status === 'dispatched'
  const failed = row.status === 'failed' || row.status === 'interrupted'
  const title = delegateShortTitle(row.goal) || row.goal

  const label = working ? copy.quietWorkingOn(title) : failed ? copy.quietFailed(title) : copy.quietDone(title)

  const glyph = working ? (
    <GlyphSpinner
      ariaLabel={copy.statusRunning}
      className="size-3.5 text-[0.95rem] text-(--ui-text-tertiary)"
      spinner="breathe"
    />
  ) : (
    statusGlyph(row.status, failed ? copy.statusError : copy.statusDone)
  )

  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5" data-conversation-scaffold="" data-quiet-delegate-row="">
      <span className={SCAFFOLD_GLYPH_CLASS}>{glyph}</span>
      <span className={cn(SCAFFOLD_LABEL_CLASS, 'min-w-0 truncate', working && 'shimmer')} title={row.goal}>
        {label}
      </span>
    </div>
  )
}

/**
 * A `delegate_task` call, as the fan-out it is.
 *
 * The generic tool row can only say "Delegated 2 tasks" and hand over a blob
 * of JSON — the work itself happens in child sessions the transcript never
 * sees. This lists those children instead, joining what the call dispatched to
 * what the subagent store knows about them, so a delegation reads like the
 * several agents it actually is.
 *
 * A card, never folded into a run summary: the point of the block is the live
 * list, and a ticker cycling one line across five children would show four of
 * them nothing.
 */
export const DelegateTool: FC<Pick<ToolPart, 'args' | 'result' | 'toolCallId'>> = ({ args, result, toolCallId }) => {
  const view = useSessionView()
  const sessionId = useStore(view.$runtimeId)
  const messages = useStore(view.$messages)
  const live = useSessionSlice($subagentsBySession, sessionId)
  const { quiet } = useSessionDisplay()

  const settledIds = useMemo(
    () => new Set(messages.flatMap(message => message.asyncDelegationIds ?? [])),
    [messages]
  )

  const rows = useMemo(() => {
    const merged = mergeDelegateRows(delegateRowsFromCall(args, result, toolCallId), live, toolCallId)

    return settleDelegateRowsFromTranscript(merged, result, settledIds)
  }, [args, live, result, settledIds, toolCallId])

  if (rows.length === 0) {
    return null
  }

  if (quiet) {
    return (
      <div className="grid min-w-0 gap-1" data-delegate-card="" data-delegate-quiet="" data-slot="tool-block">
        {rows.map(row => (
          <QuietDelegateRowView key={row.id} row={row} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-(--tool-row-gap)" data-delegate-card="" data-slot="tool-block">
      {rows.map(row => (
        <DelegateRowView key={row.id} row={row} />
      ))}
    </div>
  )
}
