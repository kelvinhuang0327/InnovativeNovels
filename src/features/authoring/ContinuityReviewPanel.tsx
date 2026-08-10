import { useEffect, useState } from 'react'
import type { ClipboardPort } from '../../application/authoring/clipboardPort'
import type { AuthoringSpec } from '../../domain/authoring/authoringContracts'
import {
  applyAcceptedContinuityReview,
  completeContinuityReview,
  createContinuityReviewBatch,
  decideContinuityReviewProposal,
  DEFAULT_CONTINUITY_REVIEW_BATCH_SIZE,
  getContinuityReviewStatus,
  importContinuityReviewProposals,
  isContinuityReviewBatchStale,
  MAX_CONTINUITY_REVIEW_BATCH_SIZE,
  type ContinuityReviewBatchV1,
  type ContinuityReviewProposalDecision,
} from '../../domain/authoring/continuityReview'
import type { Draft } from '../../domain/authoring/authoringContracts'
import type { StoryBibleV1 } from '../../domain/authoring/storyBible'

interface ContinuityReviewPanelProps {
  readonly draft?: Draft
  readonly spec: AuthoringSpec
  readonly storyBible: StoryBibleV1
  readonly projectId?: string
  readonly checkpoint: number
  readonly batch?: ContinuityReviewBatchV1
  readonly clipboardPort?: ClipboardPort
  readonly onBatchChange: (batch: ContinuityReviewBatchV1 | undefined) => void
  readonly onApply: (
    storyBible: StoryBibleV1,
    batch: ContinuityReviewBatchV1,
  ) => void
  readonly onComplete: (checkpoint: number) => void
}

type CopyState = 'copying' | 'copied' | 'failed' | undefined

export function ContinuityReviewPanel({
  draft,
  spec,
  storyBible,
  projectId,
  checkpoint,
  batch,
  clipboardPort,
  onBatchChange,
  onApply,
  onComplete,
}: ContinuityReviewPanelProps) {
  const [batchSize, setBatchSize] = useState(DEFAULT_CONTINUITY_REVIEW_BATCH_SIZE)
  const [rawProposals, setRawProposals] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [parseErrors, setParseErrors] = useState<readonly string[]>([])
  const [copyState, setCopyState] = useState<CopyState>()

  const status = getContinuityReviewStatus(draft, checkpoint, batchSize)

  useEffect(() => {
    if (!batch || !draft || batch.status === 'STALE' || batch.status === 'COMPLETED') {
      return
    }
    let cancelled = false
    void isContinuityReviewBatchStale(batch, draft, storyBible, projectId).then(
      (stale) => {
        if (!cancelled && stale && batch.status !== 'STALE') {
          onBatchChange({ ...batch, status: 'STALE' })
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [batch, draft, onBatchChange, projectId, storyBible])

  const handleGenerate = async () => {
    if (!draft || !status.nextEligibleRange) {
      setErrorMessage('目前沒有可供 continuity review 的未審閱章節。')
      return
    }
    setErrorMessage(undefined)
    setParseErrors([])
    const nextRange = {
      reviewedFromSequence: status.nextEligibleRange.reviewedFromSequence,
      reviewedToSequence:
        status.nextEligibleRange.reviewedFromSequence +
        Math.min(batchSize, status.unreviewedChapterSequences.length) -
        1,
    }
    const created = await createContinuityReviewBatch({
      draft,
      specGenre: spec.genre,
      storyBible,
      projectId,
      ...nextRange,
    })
    if (!created.ok) {
      setErrorMessage(created.message)
      return
    }
    setRawProposals('')
    setCopyState(undefined)
    onBatchChange(created.batch)
  }

  const handleCopy = async () => {
    if (!batch) return
    setCopyState('copying')
    try {
      if (!clipboardPort) throw new Error('Clipboard capability unavailable.')
      await clipboardPort.writeText(batch.generatedPrompt)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  const handleParse = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!batch) return
    setErrorMessage(undefined)
    const imported = importContinuityReviewProposals(batch, storyBible, rawProposals)
    if (!imported.ok) {
      setParseErrors(imported.errors.map((error) => error.message))
      return
    }
    setParseErrors([])
    onBatchChange(imported.batch)
  }

  const handleDecision = (
    index: number,
    decision: Exclude<ContinuityReviewProposalDecision, 'PENDING'>,
  ) => {
    if (!batch) return
    const next = decideContinuityReviewProposal(batch, index, decision)
    if (!next.ok) {
      setErrorMessage(next.message)
      return
    }
    setErrorMessage(undefined)
    onBatchChange(next.batch)
  }

  const handleApply = async () => {
    if (!batch || !draft) return
    setErrorMessage(undefined)
    const applied = await applyAcceptedContinuityReview({
      batch,
      draft,
      storyBible,
      activeProjectId: projectId,
    })
    if (!applied.ok) {
      setErrorMessage(applied.message)
      if (applied.message.includes('STALE')) onBatchChange({ ...batch, status: 'STALE' })
      return
    }
    onApply(applied.storyBible, applied.batch)
  }

  const handleComplete = async () => {
    if (!batch || !draft) return
    setErrorMessage(undefined)
    const completed = await completeContinuityReview({
      batch,
      draft,
      storyBible,
      activeProjectId: projectId,
      currentCheckpoint: checkpoint,
    })
    if (!completed.ok) {
      setErrorMessage(completed.message)
      if (completed.message.includes('STALE')) onBatchChange({ ...batch, status: 'STALE' })
      return
    }
    setRawProposals('')
    setParseErrors([])
    onComplete(completed.checkpoint)
  }

  const canGenerate = !batch || batch.status === 'STALE'
  const canApply =
    batch !== undefined &&
    (batch.status === 'READY_TO_APPLY' || batch.status === 'PROPOSALS_IMPORTED') &&
    batch.proposals.length > 0
  const canComplete =
    batch !== undefined &&
    batch.status !== 'STALE' &&
    batch.status !== 'DRAFT'

  return (
    <section aria-labelledby="continuity-review-heading" className="agent-exchange-panel">
      <h2 id="continuity-review-heading">Continuity Review</h2>
      <p>
        Continuity review 只提出 Story Bible 變更；外部 Agent 不會連線，任何變更都必須由你明確決定。
      </p>
      <p className="authoring-quality-status" role="status">
        Reviewed through chapter {checkpoint} · Unreviewed chapters: {status.unreviewedChapterSequences.length}
      </p>
      {status.unreviewedChapterSequences.length === 0 ? (
        <p role="status">Continuity review up to date.</p>
      ) : (
        <p>
          Next eligible range: chapters {status.nextEligibleRange?.reviewedFromSequence}–{status.nextEligibleRange?.reviewedToSequence}
        </p>
      )}
      <label className="authoring-field" htmlFor="continuity-review-batch-size">
        Review batch size (1–5)
        <select
          id="continuity-review-batch-size"
          onChange={(event) => setBatchSize(Number(event.target.value))}
          value={batchSize}
        >
          {Array.from({ length: MAX_CONTINUITY_REVIEW_BATCH_SIZE }, (_, index) => index + 1).map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>
      <button disabled={!draft || !status.nextEligibleRange || !canGenerate} onClick={() => void handleGenerate()} type="button">
        {batch?.status === 'STALE' ? 'Regenerate Review Prompt' : 'Review Next Chapters'}
      </button>

      {batch && (
        <>
          <p className="authoring-quality-status" role="status">
            Batch chapters {batch.reviewedFromSequence}–{batch.reviewedToSequence} · Status: {batch.status}
          </p>
          {batch.status === 'STALE' && (
            <p className="authoring-error" role="alert">
              This review batch is STALE because its Draft range, Story Bible, or project context changed. Regenerate it before applying or completing.
            </p>
          )}
          <label className="authoring-field" htmlFor="continuity-review-prompt">
            Generated Review Prompt
            <textarea id="continuity-review-prompt" readOnly value={batch.generatedPrompt} />
          </label>
          <div className="actions">
            <button disabled={copyState === 'copying'} onClick={() => void handleCopy()} type="button">
              Copy Review Prompt
            </button>
            {copyState === 'copied' && <p className="authoring-copy-status" role="status">Review prompt copied.</p>}
            {copyState === 'failed' && <p className="authoring-error" role="alert">Clipboard unavailable; select the prompt above and copy it manually.</p>}
          </div>

          <form onSubmit={handleParse}>
            <label className="authoring-field" htmlFor="continuity-review-proposals-json">
              Proposal JSON (raw JSON only)
              <textarea
                id="continuity-review-proposals-json"
                onChange={(event) => setRawProposals(event.target.value)}
                placeholder={'{"proposals":[]}' }
                value={rawProposals}
              />
            </label>
            <button disabled={batch.status === 'STALE'} type="submit">Parse Proposals</button>
          </form>
          {parseErrors.length > 0 && (
            <div className="authoring-error" role="alert">
              <p>Proposal parsing failed. Story Bible was not changed.</p>
              <ul>{parseErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>
            </div>
          )}

          {batch.proposals.length > 0 && (
            <section aria-labelledby="continuity-review-proposals-heading">
              <h3 id="continuity-review-proposals-heading">Review Proposals</h3>
              <ol>
                {batch.proposals.map((record, index) => (
                  <li key={`${record.proposal.type}-${index}`}>
                    <p><strong>{record.proposal.type}</strong> · {record.validity} · Decision: {record.decision}</p>
                    <p>{'name' in record.proposal ? `${record.proposal.name}: ${record.proposal.notes}` : record.proposal.text}</p>
                    <p>Reason: {record.proposal.reason}</p>
                    {record.conflictReason && <p className="authoring-error" role="alert">Conflict: {record.conflictReason}</p>}
                    <div className="actions">
                      <button
                        disabled={record.validity === 'CONFLICT' || batch.status === 'APPLIED' || batch.status === 'STALE'}
                        onClick={() => handleDecision(index, 'ACCEPT')}
                        type="button"
                      >Accept proposal {index + 1}</button>
                      <button
                        disabled={batch.status === 'APPLIED' || batch.status === 'STALE'}
                        onClick={() => handleDecision(index, 'REJECT')}
                        type="button"
                      >Reject proposal {index + 1}</button>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {errorMessage && <p className="authoring-error" role="alert">{errorMessage}</p>}
          <div className="actions">
            <button disabled={!canApply} onClick={() => void handleApply()} type="button">Apply Accepted</button>
            <button disabled={!canComplete} onClick={() => void handleComplete()} type="button">Complete Review</button>
          </div>
        </>
      )}
    </section>
  )
}
