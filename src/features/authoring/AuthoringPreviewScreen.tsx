import { useEffect, useState, type FormEvent } from 'react'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import { importAgentDraft } from '../../application/authoring/agentDraftImport'
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

interface AuthoringPreviewScreenProps {
  readonly gatewayClient: AuthoringGatewayClient
  readonly onBack: () => void
  readonly sessionRepository?: AuthoringSessionRepository
  readonly clipboardPort?: ClipboardPort
  readonly productionBooks?: readonly ContentBook[]
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
  readonly source: 'gateway' | 'agent-import' | 'restored-session'
}

type ClipboardStatus = 'copying' | 'copied' | 'failed'
type ClipboardTarget = 'prompt' | 'draft'

function hasMeaningfulSession(
  spec: AuthoringSpec,
  agentPrompt: string | undefined,
  draft: Draft | undefined,
  publicationPreparation: PublicationPreparationMetadata,
): boolean {
  return (
    spec.premise.trim().length > 0 ||
    spec.genre !== INITIAL_SPEC.genre ||
    Boolean(spec.titleHint?.trim()) ||
    Boolean(spec.instructions?.trim()) ||
    spec.requestedChapterCount !== INITIAL_SPEC.requestedChapterCount ||
    Boolean(agentPrompt) ||
    Boolean(draft) ||
    Boolean(publicationPreparation.publicationSlug.trim()) ||
    Boolean(publicationPreparation.authorName.trim()) ||
    Boolean(publicationPreparation.description.trim()) ||
    publicationPreparation.catalogSequence !== undefined
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

export function AuthoringPreviewScreen({
  gatewayClient,
  onBack,
  sessionRepository,
  clipboardPort,
  productionBooks = [],
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
  const [result, setResult] = useState<DraftPreviewResult | undefined>(() =>
    restoredPreviewResult(restoredSession),
  )
  const [publicationPreparation, setPublicationPreparation] =
    useState<PublicationPreparationMetadata>(
      () =>
        restoredSession?.publicationPreparation ?? INITIAL_PUBLICATION_PREPARATION,
    )
  const [qualityIsStale, setQualityIsStale] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [importErrors, setImportErrors] = useState<
    readonly AgentDraftValidationError[]
  >([])
  const [rawAgentDraft, setRawAgentDraft] = useState('')
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
        result?.draft,
        publicationPreparation,
      )
    ) {
      sessionRepository.clear()
      return
    }

    sessionRepository.save({
      spec,
      agentPrompt,
      draft: result?.draft,
      publicationPreparation,
    })
  }, [agentPrompt, publicationPreparation, result, sessionRepository, spec])

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
    setQualityIsStale(true)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(undefined)
    setImportErrors([])

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
    setResult({
      ok: true,
      draft: imported.draft,
      quality: imported.quality,
      providerName: 'external-agent-import',
      source: 'agent-import',
    })
    setQualityIsStale(false)
  }

  const handleRecheckQuality = () => {
    if (!result) {
      return
    }

    const quality = evaluateDraftQuality(result.draft)
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
    setResult(undefined)
    setPublicationPreparation(INITIAL_PUBLICATION_PREPARATION)
    setQualityIsStale(false)
    setErrorMessage(undefined)
    setImportErrors([])
    setRawAgentDraft('')
    setClipboardStatus(undefined)
    setClipboardTarget(undefined)
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
