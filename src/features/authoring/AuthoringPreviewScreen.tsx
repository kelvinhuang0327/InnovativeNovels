import { useEffect, useState, type FormEvent } from 'react'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import { importAgentDraft } from '../../application/authoring/agentDraftImport'
import {
  buildContinuationPrompt,
} from '../../application/authoring/continuationPromptBuilder'
import { importContinuation } from '../../application/authoring/continuationImport'
import { buildAgentPrompt } from '../../application/authoring/agentPromptBuilder'
import { exportDraftJson } from '../../application/authoring/draftExport'
import type {
  AuthoringSession,
  AuthoringSessionRepository,
} from '../../application/authoring/authoringSessionRepository'
import type { ContentBook } from '../../application/catalog/contentRepository'
import type { ClipboardPort } from '../../application/authoring/clipboardPort'
import type {
  AuthoringSpec,
  Draft,
  GeneratedDraft,
} from '../../domain/authoring/authoringContracts'
import type { AgentDraftValidationError } from '../../domain/authoring/agentDraftExchange'
import {
  DEFAULT_CONTINUATION_CHAPTER_COUNT,
  MAX_CONTINUATION_CHAPTER_COUNT,
  MIN_CONTINUATION_CHAPTER_COUNT,
  type ContinuationValidationError,
} from '../../domain/authoring/continuationExchange'
import {
  addDraftChapter,
  moveDraftChapter,
  removeDraftChapter,
  updateDraftChapter,
  updateDraftMetadata,
} from '../../domain/authoring/draftEditing'
import {
  evaluateDraftQuality,
  type DraftQualityResult,
} from '../../domain/authoring/qualityEvaluator'
import { validateAuthoringSpec } from '../../domain/authoring/authoringContracts'
import {
  buildPublicationCandidate,
  type PublicationPreparationMetadata,
} from '../../domain/authoring/publicationCandidate'
import {
  buildPublishedAppendCandidate,
  createPublishedBookSnapshot,
  exportPublishedAppendCandidate,
  fingerprintPublishedBook,
  isPublishedAppendCandidateCurrent,
  type PublishedAppendCandidate,
  type PublishedAppendCandidateBuildResult,
  type ProductionFixtureValidator,
} from '../../domain/authoring/publishedAppendCandidate'
import { buildPublishedBookContinuationDraft } from '../../domain/authoring/publishedBookContinuation'

interface AuthoringPreviewScreenProps {
  readonly gatewayClient: AuthoringGatewayClient
  readonly onBack: () => void
  readonly sessionRepository?: AuthoringSessionRepository
  readonly clipboardPort?: ClipboardPort
  readonly productionBooks?: readonly ContentBook[]
  readonly productionChapterProse?: (
    chapterId: string,
  ) => readonly string[] | undefined
  readonly validateProductionFixture?: ProductionFixtureValidator
}

const INITIAL_SPEC: AuthoringSpec = {
  premise: '',
  genre: '懸疑',
  titleHint: '',
  instructions: '',
  requestedChapterCount: 3,
}

const INITIAL_PUBLICATION_PREPARATION: PublicationPreparationMetadata = {
  publicationSlug: '',
  authorName: '',
  description: '',
  catalogSequence: undefined,
}

type SuccessfulDraftResult = Extract<
  AuthoringGatewayClientResult,
  { readonly ok: true }
>

type DraftPreviewResult = SuccessfulDraftResult & {
  readonly source:
    | 'gateway'
    | 'agent-import'
    | 'continuation-import'
    | 'published-book-import'
    | 'restored-session'
}

type ClipboardStatus = 'copying' | 'copied' | 'failed'
type ClipboardTarget = 'prompt' | 'continuation-prompt' | 'draft' | 'append-candidate'

function restoredAppendBuildResult(
  candidate: PublishedAppendCandidate,
): PublishedAppendCandidateBuildResult {
  return {
    readiness: candidate.readiness,
    targetPublishedBookId: candidate.targetPublishedBookId,
    baseFixtureFingerprint: candidate.baseFixtureFingerprint,
    publishedChapterCount: candidate.publishedChapterCount,
    proposedAppendedChapterCount: candidate.appendedChapters.length,
    quality: candidate.quality,
    validation: { status: 'PASS' },
    issues: [],
    warnings: candidate.warnings,
    candidate,
  }
}

function hasMeaningfulSession(
  spec: AuthoringSpec,
  agentPrompt: string | undefined,
  continuationPrompt: string | undefined,
  draft: Draft | undefined,
  publicationPreparation: PublicationPreparationMetadata,
  targetPublishedBookId: string | undefined,
  basePublishedBookFingerprint: string | undefined,
  publishedAppendCandidate: PublishedAppendCandidate | undefined,
): boolean {
  return (
    spec.premise.trim().length > 0 ||
    spec.genre !== INITIAL_SPEC.genre ||
    Boolean(spec.titleHint?.trim()) ||
    Boolean(spec.instructions?.trim()) ||
    spec.requestedChapterCount !== INITIAL_SPEC.requestedChapterCount ||
    Boolean(agentPrompt) ||
    Boolean(continuationPrompt) ||
    Boolean(draft) ||
    Boolean(publicationPreparation.publicationSlug.trim()) ||
    Boolean(publicationPreparation.authorName.trim()) ||
    Boolean(publicationPreparation.description.trim()) ||
    publicationPreparation.catalogSequence !== undefined ||
    Boolean(targetPublishedBookId) ||
    Boolean(basePublishedBookFingerprint) ||
    Boolean(publishedAppendCandidate)
  )
}

function restoredPreviewResult(
  session: AuthoringSession | undefined,
): DraftPreviewResult | undefined {
  if (!session?.draft) {
    return undefined
  }

  return {
    ok: true,
    draft: session.draft,
    quality: session.draft.quality,
    providerName: 'local-authoring-session',
    source: 'restored-session',
  }
}

function withQuality(
  generated: GeneratedDraft,
  quality: DraftQualityResult,
): Draft {
  return { ...generated, status: 'DRAFT', quality }
}

function snapshotForPublishedBook(
  selectedPublishedBook: ContentBook,
  productionChapterProse: (
    chapterId: string,
  ) => readonly string[] | undefined,
) {
  return createPublishedBookSnapshot(
    {
      book: {
        id: selectedPublishedBook.book.id as string,
        title: selectedPublishedBook.book.title,
        authorName: selectedPublishedBook.book.authorName,
        categoryLabel: selectedPublishedBook.book.categoryLabel,
      },
      catalogSequence: selectedPublishedBook.catalogSequence,
      description: selectedPublishedBook.description,
      chapters: selectedPublishedBook.chapters.map((chapter) => ({
        chapterId: chapter.id as string,
        sequence: chapter.sequence,
        title: chapter.title,
        access: chapter.access,
      })),
    },
    productionChapterProse,
  )
}

function draftsHaveSameContent(left: Draft | undefined, right: Draft): boolean {
  if (!left) {
    return false
  }

  return JSON.stringify({
    title: left.title,
    categoryLabel: left.categoryLabel,
    chapters: left.chapters,
  }) === JSON.stringify({
    title: right.title,
    categoryLabel: right.categoryLabel,
    chapters: right.chapters,
  })
}

export function AuthoringPreviewScreen({
  gatewayClient,
  onBack,
  sessionRepository,
  clipboardPort,
  productionBooks = [],
  productionChapterProse,
  validateProductionFixture,
}: AuthoringPreviewScreenProps) {
  const [restoredSession] = useState<AuthoringSession | undefined>(() =>
    sessionRepository?.load(),
  )
  const [spec, setSpec] = useState<AuthoringSpec>(
    () => restoredSession?.spec ?? INITIAL_SPEC,
  )
  const [agentPrompt, setAgentPrompt] = useState<string | undefined>(
    () => restoredSession?.agentPrompt,
  )
  const [continuationPrompt, setContinuationPrompt] = useState<
    string | undefined
  >(() => restoredSession?.continuationPrompt)
  const [result, setResult] = useState<DraftPreviewResult | undefined>(() =>
    restoredPreviewResult(restoredSession),
  )
  const [publicationPreparation, setPublicationPreparation] =
    useState<PublicationPreparationMetadata>(
      () =>
        restoredSession?.publicationPreparation ?? INITIAL_PUBLICATION_PREPARATION,
    )
  const [targetPublishedBookId, setTargetPublishedBookId] = useState<
    string | undefined
  >(() => restoredSession?.targetPublishedBookId)
  const [basePublishedBookFingerprint, setBasePublishedBookFingerprint] =
    useState<string | undefined>(() => restoredSession?.basePublishedBookFingerprint)
  const [publishedBookSelection, setPublishedBookSelection] = useState(
    () => restoredSession?.targetPublishedBookId ?? '',
  )
  const [publishedAppendCandidate, setPublishedAppendCandidate] = useState<
    PublishedAppendCandidate | undefined
  >(() => restoredSession?.publishedAppendCandidate)
  const [appendBuildResult, setAppendBuildResult] = useState<
    PublishedAppendCandidateBuildResult | undefined
  >(() =>
    restoredSession?.publishedAppendCandidate
      ? restoredAppendBuildResult(restoredSession.publishedAppendCandidate)
      : undefined,
  )
  const [isPreparingAppend, setIsPreparingAppend] = useState(false)
  const [qualityIsStale, setQualityIsStale] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [importErrors, setImportErrors] = useState<
    readonly AgentDraftValidationError[]
  >([])
  const [rawAgentDraft, setRawAgentDraft] = useState('')
  const [continuationChapterCount, setContinuationChapterCount] = useState(
    DEFAULT_CONTINUATION_CHAPTER_COUNT,
  )
  const [rawContinuationJson, setRawContinuationJson] = useState('')
  const [continuationImportErrors, setContinuationImportErrors] = useState<
    readonly ContinuationValidationError[]
  >([])
  const [clipboardStatus, setClipboardStatus] = useState<ClipboardStatus>()
  const [clipboardTarget, setClipboardTarget] = useState<ClipboardTarget>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!sessionRepository) {
      return
    }

    if (
      !hasMeaningfulSession(
        spec,
        agentPrompt,
        continuationPrompt,
        result?.draft,
        publicationPreparation,
        targetPublishedBookId,
        basePublishedBookFingerprint,
        publishedAppendCandidate,
      )
    ) {
      sessionRepository.clear()
      return
    }

    sessionRepository.save({
      spec,
      agentPrompt,
      continuationPrompt,
      draft: result?.draft,
      publicationPreparation,
      targetPublishedBookId,
      basePublishedBookFingerprint,
      publishedAppendCandidate,
    })
  }, [
    agentPrompt,
    continuationPrompt,
    publicationPreparation,
    publishedAppendCandidate,
    basePublishedBookFingerprint,
    result,
    sessionRepository,
    spec,
    targetPublishedBookId,
  ])

  const currentQuality = result
    ? evaluateDraftQuality(result.draft)
    : undefined
  const isExportBlocked = Boolean(currentQuality?.hardFailures.length)
  const publicationCandidate = result
    ? buildPublicationCandidate(
        result.draft,
        publicationPreparation,
        productionBooks.map(({ book, chapters }) => ({
          bookId: book.id as string,
          chapterIds: chapters.map((chapter) => chapter.id as string),
        })),
      )
    : undefined
  const selectedPublishedBook = productionBooks.find(
    ({ book }) => (book.id as string) === targetPublishedBookId,
  )
  const continuationSelectionBook = productionBooks.find(
    ({ book }) => (book.id as string) === publishedBookSelection,
  )
  const publishedBookSnapshot = selectedPublishedBook
    ? snapshotForPublishedBook(
        selectedPublishedBook,
        productionChapterProse ?? (() => undefined),
      )
    : undefined
  const allProductionChapterIds = productionBooks.flatMap(({ chapters }) =>
    chapters.map((chapter) => chapter.id as string),
  )
  const displayedAppendResult =
    appendBuildResult ??
    (publishedAppendCandidate
      ? restoredAppendBuildResult(publishedAppendCandidate)
      : undefined)

  useEffect(() => {
    if (
      !publishedAppendCandidate ||
      !result ||
      !targetPublishedBookId ||
      !publishedBookSnapshot
    ) {
      return
    }

    let cancelled = false
    void isPublishedAppendCandidateCurrent(
      publishedAppendCandidate,
      result.draft,
      targetPublishedBookId,
      publishedBookSnapshot,
    )
      .then((isCurrent) => {
        if (!isCurrent && !cancelled) {
          setPublishedAppendCandidate(undefined)
          setAppendBuildResult(undefined)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPublishedAppendCandidate(undefined)
          setAppendBuildResult(undefined)
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    productionBooks,
    productionChapterProse,
    publishedAppendCandidate,
    publishedBookSnapshot,
    result,
    targetPublishedBookId,
  ])

  const hasPublicationPreparationInput =
    publicationPreparation.publicationSlug.trim().length > 0 ||
    publicationPreparation.authorName.trim().length > 0 ||
    publicationPreparation.description.trim().length > 0 ||
    publicationPreparation.catalogSequence !== undefined

  const updateCurrentDraft = (edit: (draft: GeneratedDraft) => GeneratedDraft) => {
    setResult((current) => {
      if (!current) {
        return current
      }

      return {
        ...current,
        draft: withQuality(edit(current.draft), current.draft.quality),
      }
    })
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setContinuationPrompt(undefined)
    setContinuationImportErrors([])
    setQualityIsStale(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(undefined)
    setImportErrors([])
    setContinuationImportErrors([])
    setContinuationPrompt(undefined)

    try {
      const nextResult = await gatewayClient.generateDraft(spec)
      if (!nextResult.ok) {
        setErrorMessage(
          nextResult.errors?.map((error) => error.message).join(' ') ??
            nextResult.message,
        )
        return
      }

      setResult({ ...nextResult, source: 'gateway' })
      setPublishedAppendCandidate(undefined)
      setAppendBuildResult(undefined)
      setQualityIsStale(false)
    } catch {
      setErrorMessage('創作預覽暫時無法處理。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGeneratePrompt = () => {
    const validationErrors = validateAuthoringSpec(spec)
    if (validationErrors.length > 0) {
      setErrorMessage(validationErrors.map((error) => error.message).join(' '))
      return
    }

    setAgentPrompt(buildAgentPrompt(spec))
    setClipboardStatus(undefined)
    setClipboardTarget(undefined)
    setErrorMessage(undefined)
    setImportErrors([])
  }

  const handleGenerateContinuationPrompt = () => {
    if (!result) {
      return
    }

    const continuation = buildContinuationPrompt(
      result.draft,
      spec,
      continuationChapterCount,
    )
    if (!continuation.ok) {
      setErrorMessage(continuation.message)
      return
    }

    setContinuationPrompt(continuation.prompt)
    setClipboardStatus(undefined)
    setClipboardTarget(undefined)
    setErrorMessage(undefined)
    setContinuationImportErrors([])
  }

  const handleCopy = async (text: string, target: ClipboardTarget) => {
    setClipboardTarget(target)
    setClipboardStatus('copying')
    try {
      if (!clipboardPort) {
        throw new Error('Clipboard capability unavailable.')
      }
      await clipboardPort.writeText(text)
      setClipboardStatus('copied')
    } catch {
      setClipboardStatus('failed')
    }
  }

  const handleImportDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(undefined)

    const imported = importAgentDraft(rawAgentDraft)
    if (!imported.ok) {
      setImportErrors(imported.errors)
      return
    }

    setImportErrors([])
    setContinuationImportErrors([])
    setContinuationPrompt(undefined)
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setResult({
      ok: true,
      draft: imported.draft,
      quality: imported.quality,
      providerName: 'external-agent-import',
      source: 'agent-import',
    })
    setQualityIsStale(false)
  }

  const handleImportContinuation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!result) {
      return
    }

    setErrorMessage(undefined)
    const imported = importContinuation(
      result.draft,
      rawContinuationJson,
      continuationChapterCount,
    )
    if (!imported.ok) {
      setContinuationImportErrors(imported.errors)
      return
    }

    setContinuationImportErrors([])
    setContinuationPrompt(undefined)
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setRawContinuationJson('')
    setResult((current) =>
      current
        ? {
            ...current,
            draft: imported.draft,
            quality: imported.draft.quality,
            source: 'continuation-import',
          }
        : current,
    )
    setQualityIsStale(true)
  }

  const handleRecheckQuality = () => {
    if (!result) {
      return
    }

    const quality = evaluateDraftQuality(result.draft)
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setResult((current) =>
      current
        ? {
            ...current,
            draft: withQuality(current.draft, quality),
            quality,
          }
        : current,
    )
    setQualityIsStale(false)
  }

  const handleClearSession = () => {
    sessionRepository?.clear()
    setSpec(INITIAL_SPEC)
    setAgentPrompt(undefined)
    setContinuationPrompt(undefined)
    setResult(undefined)
    setPublicationPreparation(INITIAL_PUBLICATION_PREPARATION)
    setTargetPublishedBookId(undefined)
    setBasePublishedBookFingerprint(undefined)
    setPublishedBookSelection('')
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setQualityIsStale(false)
    setErrorMessage(undefined)
    setImportErrors([])
    setRawAgentDraft('')
    setRawContinuationJson('')
    setContinuationImportErrors([])
    setContinuationChapterCount(DEFAULT_CONTINUATION_CHAPTER_COUNT)
    setClipboardStatus(undefined)
    setClipboardTarget(undefined)
  }

  const handleContinuePublishedBook = async () => {
    setErrorMessage(undefined)
    setImportErrors([])
    setContinuationImportErrors([])

    if (!continuationSelectionBook) {
      setErrorMessage('請先選擇要開始續寫的 published book。')
      return
    }

    const snapshot = snapshotForPublishedBook(
      continuationSelectionBook,
      productionChapterProse ?? (() => undefined),
    )
    if (!snapshot) {
      setErrorMessage(
        'PUBLISHED_BOOK_MALFORMED: published book 缺少有效的 catalog metadata，無法開始續寫。',
      )
      return
    }

    const converted = buildPublishedBookContinuationDraft(snapshot)
    if (!converted.ok) {
      setErrorMessage(converted.issue.message)
      return
    }

    const nextSpec: AuthoringSpec = {
      ...INITIAL_SPEC,
      premise: continuationSelectionBook.description,
      genre: continuationSelectionBook.book.categoryLabel,
      titleHint: continuationSelectionBook.book.title,
    }
    const hasMateriallyDifferentSession =
      hasMeaningfulSession(
        spec,
        agentPrompt,
        continuationPrompt,
        result?.draft,
        publicationPreparation,
        targetPublishedBookId,
        basePublishedBookFingerprint,
        publishedAppendCandidate,
      ) &&
      (targetPublishedBookId !== (continuationSelectionBook.book.id as string) ||
        !draftsHaveSameContent(result?.draft, converted.draft) ||
        JSON.stringify(spec) !== JSON.stringify(nextSpec) ||
        Boolean(agentPrompt) ||
        Boolean(continuationPrompt) ||
        hasPublicationPreparationInput ||
        Boolean(publishedAppendCandidate))

    if (
      hasMateriallyDifferentSession &&
      !window.confirm(
        '目前已有 Authoring Draft 或 session。開始此 published book continuation 會取代它，是否繼續？',
      )
    ) {
      return
    }

    let baseFingerprint: string
    try {
      baseFingerprint = await fingerprintPublishedBook(snapshot)
    } catch {
      setErrorMessage('無法建立 published book 的 deterministic base fingerprint。')
      return
    }

    setSpec(nextSpec)
    setAgentPrompt(undefined)
    setContinuationPrompt(undefined)
    setRawAgentDraft('')
    setRawContinuationJson('')
    setContinuationImportErrors([])
    setImportErrors([])
    setPublicationPreparation(INITIAL_PUBLICATION_PREPARATION)
    setTargetPublishedBookId(continuationSelectionBook.book.id as string)
    setBasePublishedBookFingerprint(baseFingerprint)
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    setResult({
      ok: true,
      draft: converted.draft,
      quality: converted.draft.quality,
      providerName: 'published-book-continuation',
      source: 'published-book-import',
    })
    setQualityIsStale(true)
  }

  const handlePrepareAppend = async () => {
    if (!result) {
      return
    }

    setIsPreparingAppend(true)
    setErrorMessage(undefined)
    setPublishedAppendCandidate(undefined)
    setAppendBuildResult(undefined)
    try {
      const buildResult = await buildPublishedAppendCandidate({
        draft: result.draft,
        targetPublishedBookId,
        publishedBook: publishedBookSnapshot,
        allProductionChapterIds,
        validateProductionFixture,
      })
      setAppendBuildResult(buildResult)
      setPublishedAppendCandidate(buildResult.candidate)
    } finally {
      setIsPreparingAppend(false)
    }
  }

  return (
    <section aria-labelledby="authoring-heading" className="authoring-screen">
      <div className="actions authoring-navigation">
        <button className="button-secondary" onClick={onBack} type="button">
          返回閱讀目錄
        </button>
        <button
          className="button-secondary"
          onClick={handleClearSession}
          type="button"
        >
          Clear Draft / Start New
        </button>
      </div>

      <p className="eyebrow">Authoring Foundation</p>
      <h1 className="screen-heading" id="authoring-heading">
        AI 創作預覽
      </h1>
      <p className="screen-copy">
        輸入一份創作規格，產生可交給外部 Agent 的提示，匯入結構化 JSON，
        並在本地編輯、檢查與匯出尚未發佈的草稿。
      </p>
      <p className="authoring-provider-note" role="status">
        Draft provider / AI provider not connected
      </p>

      {productionBooks.length > 0 && (
        <section
          aria-labelledby="published-book-continuation-heading"
          className="agent-exchange-panel"
        >
          <h2 id="published-book-continuation-heading">
            Continue Published Book
          </h2>
          <p>
            從目前 production 的完整章節建立本地 Authoring Draft；不會修改或發佈 production。
          </p>
          <label className="authoring-field" htmlFor="published-book-selection">
            Published Book
            <select
              id="published-book-selection"
              onChange={(event) => setPublishedBookSelection(event.target.value)}
              value={publishedBookSelection}
            >
              <option value="">選擇要續寫的書</option>
              {productionBooks.map(({ book, chapters }) => (
                <option key={book.id} value={book.id}>
                  {book.title}（已出版 {chapters.length} 章）
                </option>
              ))}
            </select>
          </label>
          {continuationSelectionBook && (
            <p className="authoring-draft-status" role="status">
              將載入「{continuationSelectionBook.book.title}」的{' '}
              {continuationSelectionBook.chapters.length} 章；既有章節正文與順序會完整保留。
            </p>
          )}
          <button
            disabled={!continuationSelectionBook}
            onClick={() => void handleContinuePublishedBook()}
            type="button"
          >
            Continue Published Book
          </button>
          {basePublishedBookFingerprint && targetPublishedBookId && (
            <p className="authoring-provider-note" role="status">
              Base fingerprint captured for {targetPublishedBookId}：{basePublishedBookFingerprint}
            </p>
          )}
        </section>
      )}

      <form className="authoring-form" onSubmit={handleSubmit}>
        <label className="authoring-field" htmlFor="authoring-premise">
          故事前提
          <textarea
            id="authoring-premise"
            onChange={(event) =>
              setSpec((current) => ({
                ...current,
                premise: event.target.value,
              }))
            }
            placeholder="例如：一名守夜人發現城市的鐘每天少響一聲。"
            value={spec.premise}
          />
        </label>

        <label className="authoring-field" htmlFor="authoring-genre">
          故事分類
          <input
            id="authoring-genre"
            onChange={(event) =>
              setSpec((current) => ({
                ...current,
                genre: event.target.value,
              }))
            }
            value={spec.genre}
          />
        </label>

        <label className="authoring-field" htmlFor="authoring-title-hint">
          工作標題提示（選填）
          <input
            id="authoring-title-hint"
            onChange={(event) =>
              setSpec((current) => ({
                ...current,
                titleHint: event.target.value,
              }))
            }
            value={spec.titleHint ?? ''}
          />
        </label>

        <label className="authoring-field" htmlFor="authoring-instructions">
          額外創作指示（選填）
          <textarea
            id="authoring-instructions"
            onChange={(event) =>
              setSpec((current) => ({
                ...current,
                instructions: event.target.value,
              }))
            }
            value={spec.instructions ?? ''}
          />
        </label>

        <label className="authoring-field" htmlFor="authoring-chapter-count">
          預覽章節數（1–6）
          <input
            id="authoring-chapter-count"
            max={6}
            min={1}
            onChange={(event) =>
              setSpec((current) => ({
                ...current,
                requestedChapterCount:
                  event.target.value.length > 0
                    ? Number(event.target.value)
                    : undefined,
              }))
            }
            type="number"
            value={spec.requestedChapterCount ?? ''}
          />
        </label>

        <div className="actions authoring-form-actions">
          <button onClick={handleGeneratePrompt} type="button">
            Generate Agent Prompt
          </button>
          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? '產生中…' : '產生草稿預覽'}
          </button>
        </div>
      </form>

      {errorMessage && (
        <p className="authoring-error" role="alert">
          {errorMessage}
        </p>
      )}

      {agentPrompt && (
        <section aria-labelledby="agent-prompt-heading" className="agent-exchange-panel">
          <h2 id="agent-prompt-heading">Agent Prompt</h2>
          <p>
            請將下方提示貼給任一 capable external Agent，要求對方只回傳 raw JSON。
          </p>
          <label className="authoring-field" htmlFor="agent-prompt-output">
            Generated Agent Prompt
            <textarea
              aria-label="Generated Agent Prompt"
              id="agent-prompt-output"
              readOnly
              value={agentPrompt}
            />
          </label>
          <div className="actions">
            <button
              disabled={clipboardStatus === 'copying'}
              onClick={() => void handleCopy(agentPrompt, 'prompt')}
              type="button"
            >
              Copy Agent Prompt
            </button>
            {clipboardStatus === 'copied' && clipboardTarget === 'prompt' && (
              <p className="authoring-copy-status" role="status">
                Prompt copied.
              </p>
            )}
            {clipboardStatus === 'failed' && clipboardTarget === 'prompt' && (
              <p className="authoring-error" role="alert">
                無法自動複製，請選取下方提示文字手動複製。
              </p>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="agent-import-heading" className="agent-exchange-panel">
        <h2 id="agent-import-heading">Structured Draft Import</h2>
        <p>
          將外部 Agent 的完整回應貼上。V1 只接受 raw JSON object；不要貼上說明文字或 Markdown code fence。
        </p>
        <form onSubmit={handleImportDraft}>
          <label className="authoring-field" htmlFor="agent-draft-json">
            Raw Agent JSON
            <textarea
              aria-label="Raw Agent JSON"
              id="agent-draft-json"
              onChange={(event) => setRawAgentDraft(event.target.value)}
              placeholder={'{"title":"小說名稱","genre":"類型","chapters":[]}' }
              value={rawAgentDraft}
            />
          </label>
          <button type="submit">Import Structured Draft</button>
        </form>
        {importErrors.length > 0 && (
          <div className="authoring-error" role="alert">
            <p>Import validation failed. The previous accepted Draft was preserved.</p>
            <ul>
              {importErrors.map((error, index) => (
                <li key={`${error.code}-${error.path ?? index}`}>
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {result && currentQuality && (
        <section aria-labelledby="draft-preview-heading" className="draft-preview">
          <div className="draft-preview-header">
            <div>
              <p className="authoring-draft-status">DRAFT / NOT PUBLISHED</p>
              <p className="authoring-provider-note">
                {result.source === 'agent-import'
                  ? '來源：外部 Agent JSON（本地匯入）'
                  : result.source === 'continuation-import'
                    ? '來源：外部 Continuation JSON（本地附加）'
                  : result.source === 'published-book-import'
                    ? '來源：published production book（本地續寫 Draft）'
                  : result.source === 'restored-session'
                    ? '來源：本地 authoring session restore'
                    : `Provider: ${result.providerName}`}
              </p>
            </div>
            <div>
              <p className="authoring-quality-status" role="status">
                品質檢查：{qualityIsStale ? 'STALE' : result.draft.quality.status}
              </p>
              <p className="authoring-quality-status">
                驗證狀態：{currentQuality.hardFailures.length === 0 ? 'PASS' : 'FAIL'}
              </p>
              {qualityIsStale && (
                <p className="authoring-quality-stale" role="status">
                  草稿已變更，品質結果需要重新檢查。
                </p>
              )}
            </div>
          </div>

          <h2 id="draft-preview-heading">{result.draft.title}</h2>
          <p className="authoring-category">
            分類：{result.draft.categoryLabel}
          </p>
          <div className="authoring-draft-fields">
            <label className="authoring-field" htmlFor="draft-title">
              草稿標題
              <input
                aria-describedby="draft-validation-feedback"
                aria-invalid={currentQuality.hardFailures.some(
                  (issue) => issue.code === 'TITLE_REQUIRED',
                )}
                id="draft-title"
                onChange={(event) =>
                  updateCurrentDraft((draft) =>
                    updateDraftMetadata(draft, { title: event.target.value }),
                  )
                }
                value={result.draft.title}
              />
            </label>
            <label className="authoring-field" htmlFor="draft-genre">
              草稿分類／Genre
              <input
                aria-describedby="draft-validation-feedback"
                aria-invalid={currentQuality.hardFailures.some(
                  (issue) => issue.code === 'CATEGORY_REQUIRED',
                )}
                id="draft-genre"
                onChange={(event) =>
                  updateCurrentDraft((draft) =>
                    updateDraftMetadata(draft, {
                      categoryLabel: event.target.value,
                    }),
                  )
                }
                value={result.draft.categoryLabel}
              />
            </label>
          </div>

          <div className="actions authoring-review-actions">
            <button onClick={handleRecheckQuality} type="button">
              Re-check Quality
            </button>
          </div>

          <section
            aria-labelledby="continuation-heading"
            className="agent-exchange-panel"
          >
            <h3 id="continuation-heading">Continue with Agent</h3>
            <p>
              只為目前有效 Draft 產生下一段章節提示；這個流程不會呼叫外部模型，也不會改寫既有章節。
            </p>
            {currentQuality.hardFailures.length > 0 ? (
              <p role="status">
                目前 Draft 有硬性驗證失敗，請先修正後再使用續寫。
              </p>
            ) : (
              <>
                <label
                  className="authoring-field"
                  htmlFor="continuation-chapter-count"
                >
                  Requested next chapters（1–5）
                  <input
                    id="continuation-chapter-count"
                    max={MAX_CONTINUATION_CHAPTER_COUNT}
                    min={MIN_CONTINUATION_CHAPTER_COUNT}
                    onChange={(event) =>
                      setContinuationChapterCount(Number(event.target.value))
                    }
                    type="number"
                    value={continuationChapterCount}
                  />
                </label>
                <div className="actions">
                  <button
                    onClick={handleGenerateContinuationPrompt}
                    type="button"
                  >
                    Generate Continuation Prompt
                  </button>
                </div>
                {continuationPrompt && (
                  <>
                    <label
                      className="authoring-field"
                      htmlFor="continuation-prompt-output"
                    >
                      Generated Continuation Prompt
                      <textarea
                        aria-label="Generated Continuation Prompt"
                        id="continuation-prompt-output"
                        readOnly
                        value={continuationPrompt}
                      />
                    </label>
                    <div className="actions">
                      <button
                        disabled={clipboardStatus === 'copying'}
                        onClick={() =>
                          void handleCopy(
                            continuationPrompt,
                            'continuation-prompt',
                          )
                        }
                        type="button"
                      >
                        Copy Continuation Prompt
                      </button>
                      {clipboardStatus === 'copied' &&
                        clipboardTarget === 'continuation-prompt' && (
                          <p className="authoring-copy-status" role="status">
                            Continuation prompt copied.
                          </p>
                        )}
                      {clipboardStatus === 'failed' &&
                        clipboardTarget === 'continuation-prompt' && (
                          <p className="authoring-error" role="alert">
                            無法自動複製，請選取下方續寫提示文字手動複製。
                          </p>
                        )}
                    </div>
                  </>
                )}
                <form onSubmit={handleImportContinuation}>
                  <label
                    className="authoring-field"
                    htmlFor="continuation-json"
                  >
                    Raw Continuation JSON
                    <textarea
                      aria-label="Raw Continuation JSON"
                      id="continuation-json"
                      onChange={(event) =>
                        setRawContinuationJson(event.target.value)
                      }
                      placeholder={'{"chapters":[{"sequence":4,"title":"下一章","prose":"正文"}]}' }
                      value={rawContinuationJson}
                    />
                  </label>
                  <button type="submit">Import Continuation</button>
                </form>
                {continuationImportErrors.length > 0 && (
                  <div className="authoring-error" role="alert">
                    <p>
                      Continuation validation failed. The previous accepted Draft was preserved.
                    </p>
                    <ul>
                      {continuationImportErrors.map((error, index) => (
                        <li key={`${error.code}-${error.path ?? index}`}>
                          {error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="hard-failures-heading">
            <h3 id="hard-failures-heading">HARD_VALIDATION_FAILURE</h3>
            <div id="draft-validation-feedback">
              {currentQuality.hardFailures.length === 0 ? (
                <p>沒有硬性驗證失敗。</p>
              ) : (
                <ul>
                  {currentQuality.hardFailures.map((issue) => (
                    <li key={`${issue.code}-${issue.chapterSequence ?? 'draft'}`}>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="quality-warnings-heading">
            <h3 id="quality-warnings-heading">QUALITY_WARNING</h3>
            {currentQuality.warnings.length === 0 ? (
              <p>沒有品質警告。</p>
            ) : (
              <ul>
                {currentQuality.warnings.map((issue) => (
                  <li key={`${issue.code}-${issue.chapterSequence ?? 'draft'}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="draft-chapters-heading">
            <div className="draft-section-heading">
              <h3 id="draft-chapters-heading">草稿章節</h3>
              <button
                onClick={() => updateCurrentDraft((draft) => addDraftChapter(draft))}
                type="button"
              >
                Add Chapter
              </button>
            </div>
            {result.draft.chapters.length === 0 ? (
              <p className="authoring-error" role="alert">
                目前沒有章節，草稿無法通過驗證。請新增章節。
              </p>
            ) : (
              <ol className="draft-chapter-list">
                {result.draft.chapters.map((chapter) => {
                  const chapterTitleError = currentQuality.hardFailures.some(
                    (issue) =>
                      issue.code === 'CHAPTER_TITLE_REQUIRED' &&
                      issue.chapterSequence === chapter.sequence,
                  )
                  const chapterProseError = currentQuality.hardFailures.some(
                    (issue) =>
                      issue.code === 'CHAPTER_PROSE_REQUIRED' &&
                      issue.chapterSequence === chapter.sequence,
                  )

                  return (
                    <li className="draft-chapter-editor" key={chapter.sequence}>
                      <div className="draft-chapter-editor-header">
                        <h4>
                          第 {chapter.sequence} 章：{chapter.title}
                        </h4>
                        <div className="actions draft-chapter-actions">
                          <button
                            aria-label={`上移第 ${chapter.sequence} 章`}
                            disabled={chapter.sequence === 1}
                            onClick={() =>
                              updateCurrentDraft((draft) =>
                                moveDraftChapter(draft, chapter.sequence, 'up'),
                              )
                            }
                            type="button"
                          >
                            Move Up
                          </button>
                          <button
                            aria-label={`下移第 ${chapter.sequence} 章`}
                            disabled={chapter.sequence === result.draft.chapters.length}
                            onClick={() =>
                              updateCurrentDraft((draft) =>
                                moveDraftChapter(draft, chapter.sequence, 'down'),
                              )
                            }
                            type="button"
                          >
                            Move Down
                          </button>
                          <button
                            aria-label={`移除第 ${chapter.sequence} 章`}
                            onClick={() =>
                              updateCurrentDraft((draft) =>
                                removeDraftChapter(draft, chapter.sequence),
                              )
                            }
                            type="button"
                          >
                            Remove Chapter
                          </button>
                        </div>
                      </div>
                      <label
                        className="authoring-field"
                        htmlFor={`chapter-${chapter.sequence}-title`}
                      >
                        章節標題
                        <input
                          aria-describedby="draft-validation-feedback"
                          aria-invalid={chapterTitleError}
                          id={`chapter-${chapter.sequence}-title`}
                          onChange={(event) =>
                            updateCurrentDraft((draft) =>
                              updateDraftChapter(draft, chapter.sequence, {
                                title: event.target.value,
                              }),
                            )
                          }
                          value={chapter.title}
                        />
                      </label>
                      <label
                        className="authoring-field"
                        htmlFor={`chapter-${chapter.sequence}-prose`}
                      >
                        章節正文
                        <textarea
                          aria-describedby="draft-validation-feedback"
                          aria-invalid={chapterProseError}
                          id={`chapter-${chapter.sequence}-prose`}
                          onChange={(event) =>
                            updateCurrentDraft((draft) =>
                              updateDraftChapter(draft, chapter.sequence, {
                                prose: [event.target.value],
                              }),
                            )
                          }
                          value={chapter.prose.join('\n\n')}
                        />
                      </label>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="draft-export-heading" className="draft-export-panel">
            <section
              aria-labelledby="published-append-candidate-heading"
              className="draft-export-panel"
            >
              <h3 id="published-append-candidate-heading">
                Prepare Chapter Append
              </h3>
              <p>
                先選擇已發佈的書，再把 Reviewed Extended Draft 的新章節整理成留在本地的 append candidate。
                這個動作不會修改 production。
              </p>
              <label className="authoring-field" htmlFor="target-published-book">
                Published target book
                <select
                  id="target-published-book"
                  onChange={(event) => {
                    setTargetPublishedBookId(event.target.value || undefined)
                    setPublishedAppendCandidate(undefined)
                    setAppendBuildResult(undefined)
                  }}
                  value={targetPublishedBookId ?? ''}
                >
                  <option value="">Select a published book</option>
                  {productionBooks.map(({ book }) => (
                    <option key={book.id as string} value={book.id as string}>
                      {book.title} ({book.id as string})
                    </option>
                  ))}
                </select>
              </label>
              <p className="authoring-quality-status">
                Published target：
                {selectedPublishedBook
                  ? `${selectedPublishedBook.book.title} (${selectedPublishedBook.book.id as string})`
                  : 'NOT SELECTED'}
              </p>
              <p className="authoring-quality-status">
                Published chapter count：{selectedPublishedBook?.chapters.length ?? 0}
              </p>
              <p className="authoring-quality-status">
                Quality：{qualityIsStale ? 'STALE' : currentQuality.status}
              </p>
              <div className="actions">
                <button
                  disabled={!targetPublishedBookId || isPreparingAppend}
                  onClick={() => void handlePrepareAppend()}
                  type="button"
                >
                  {isPreparingAppend ? 'Preparing Chapter Append…' : 'Prepare Chapter Append'}
                </button>
              </div>
              {displayedAppendResult && (
                <>
                  <p className="authoring-quality-status" role="status">
                    Base snapshot：
                    {displayedAppendResult.baseFixtureFingerprint ?? 'NOT AVAILABLE'}
                  </p>
                  <p className="authoring-quality-status">
                    Proposed appended chapter count：{displayedAppendResult.proposedAppendedChapterCount}
                  </p>
                  <p className="authoring-quality-status">
                    Production validation：{displayedAppendResult.validation.status}
                  </p>
                  <p className="authoring-quality-status" role="status">
                    Append candidate readiness：{displayedAppendResult.readiness}
                  </p>
                  {displayedAppendResult.issues.length > 0 && (
                    <ul className="authoring-error" role="alert">
                      {displayedAppendResult.issues.map((appendIssue, index) => (
                        <li key={`${appendIssue.code}-${index}`}>
                          {appendIssue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {displayedAppendResult.warnings.length > 0 && (
                    <ul className="quality-warning-list">
                      {displayedAppendResult.warnings.map((warning, index) => (
                        <li key={`${warning.code}-${warning.chapterSequence ?? 'draft'}-${index}`}>
                          {warning.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {displayedAppendResult.validation.message && (
                    <p className="authoring-error" role="alert">
                      {displayedAppendResult.validation.message}
                    </p>
                  )}
                </>
              )}
              {publishedAppendCandidate && (
                <>
                  <p className="authoring-draft-status">
                    NOT APPLIED TO PRODUCTION
                  </p>
                  <label
                    className="authoring-field"
                    htmlFor="published-append-candidate-json"
                  >
                    Append Candidate JSON
                    <textarea
                      aria-label="Append Candidate JSON"
                      id="published-append-candidate-json"
                      readOnly
                      value={exportPublishedAppendCandidate(publishedAppendCandidate)}
                    />
                  </label>
                  <div className="actions">
                    <button
                      disabled={clipboardStatus === 'copying'}
                      onClick={() =>
                        void handleCopy(
                          exportPublishedAppendCandidate(publishedAppendCandidate),
                          'append-candidate',
                        )
                      }
                      type="button"
                    >
                      Copy Append Candidate JSON
                    </button>
                    {clipboardStatus === 'copied' && clipboardTarget === 'append-candidate' && (
                      <p className="authoring-copy-status" role="status">
                        Append candidate copied.
                      </p>
                    )}
                    {clipboardStatus === 'failed' && clipboardTarget === 'append-candidate' && (
                      <p className="authoring-error" role="alert">
                        無法自動複製，請選取下方 append candidate JSON 手動複製。
                      </p>
                    )}
                  </div>
                </>
              )}
            </section>

            <section
              aria-labelledby="publication-candidate-heading"
              className="draft-export-panel"
            >
              <h3 id="publication-candidate-heading">
                Publication Candidate Preparation
              </h3>
              <p>
                填寫發佈準備 metadata，產生留在本地、尚未加入 production catalog 的候選內容。
              </p>
              <div className="authoring-draft-fields">
                <label className="authoring-field" htmlFor="publication-slug">
                  Publication slug
                  <input
                    id="publication-slug"
                    onChange={(event) =>
                      setPublicationPreparation((current) => ({
                        ...current,
                        publicationSlug: event.target.value,
                      }))
                    }
                    value={publicationPreparation.publicationSlug}
                  />
                </label>
                <label className="authoring-field" htmlFor="publication-author-name">
                  Publication author name
                  <input
                    id="publication-author-name"
                    onChange={(event) =>
                      setPublicationPreparation((current) => ({
                        ...current,
                        authorName: event.target.value,
                      }))
                    }
                    value={publicationPreparation.authorName}
                  />
                </label>
                <label className="authoring-field" htmlFor="publication-catalog-sequence">
                  Catalog sequence
                  <input
                    id="publication-catalog-sequence"
                    min={1}
                    onChange={(event) =>
                      setPublicationPreparation((current) => ({
                        ...current,
                        catalogSequence:
                          event.target.value.length > 0
                            ? Number(event.target.value)
                            : undefined,
                      }))
                    }
                    type="number"
                    value={publicationPreparation.catalogSequence ?? ''}
                  />
                </label>
              </div>
              <label className="authoring-field" htmlFor="publication-description">
                Publication description
                <textarea
                  id="publication-description"
                  onChange={(event) =>
                    setPublicationPreparation((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  value={publicationPreparation.description}
                />
              </label>
              {hasPublicationPreparationInput && publicationCandidate && (
                <>
                  <p className="authoring-quality-status" role="status">
                    Candidate readiness：{publicationCandidate.readiness}
                  </p>
                  {publicationCandidate.issues.length > 0 && (
                    <ul className="authoring-error" role="alert">
                      {publicationCandidate.issues.map((candidateIssue) => (
                        <li key={candidateIssue.code}>
                          {candidateIssue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {publicationCandidate.warnings.length > 0 && (
                    <ul className="quality-warning-list">
                      {publicationCandidate.warnings.map((warning) => (
                        <li
                          key={`${warning.code}-${warning.chapterSequence ?? 'draft'}`}
                        >
                          {warning.message}
                        </li>
                      ))}
                    </ul>
                  )}
                  {publicationCandidate.candidate && (
                    <label
                      className="authoring-field"
                      htmlFor="publication-candidate-json"
                    >
                      Publication Candidate JSON
                      <textarea
                        aria-label="Publication Candidate JSON"
                        id="publication-candidate-json"
                        readOnly
                        value={JSON.stringify(
                          publicationCandidate.candidate,
                          null,
                          2,
                        )}
                      />
                    </label>
                  )}
                </>
              )}
            </section>
            <h3 id="draft-export-heading">Draft JSON Export</h3>
            <p>只包含目前編輯中的 title、genre 與 chapters，不含 session 或發佈資訊。</p>
            <label className="authoring-field" htmlFor="draft-json-export">
              Current Draft JSON
              <textarea
                aria-label="Draft JSON Export"
                id="draft-json-export"
                readOnly
                value={exportDraftJson(result.draft)}
              />
            </label>
            <div className="actions">
              <button
                disabled={isExportBlocked || clipboardStatus === 'copying'}
                onClick={() =>
                  void handleCopy(exportDraftJson(result.draft), 'draft')
                }
                type="button"
              >
                Copy JSON
              </button>
              {isExportBlocked && (
                <p className="authoring-error" role="alert">
                  Draft JSON 目前不是有效可匯出草稿，請先修正硬性驗證失敗。
                </p>
              )}
              {clipboardStatus === 'copied' && clipboardTarget === 'draft' && (
                <p className="authoring-copy-status" role="status">
                  Draft JSON copied.
                </p>
              )}
              {clipboardStatus === 'failed' && clipboardTarget === 'draft' && (
                <p className="authoring-error" role="alert">
                  無法自動複製，請選取下方 JSON 文字手動複製。
                </p>
              )}
            </div>
          </section>
        </section>
      )}
    </section>
  )
}
