import { useEffect, useState, type FormEvent } from 'react'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import { importAgentDraft } from '../../application/authoring/agentDraftImport'
import { buildAgentPrompt } from '../../application/authoring/agentPromptBuilder'
import type {
  AuthoringSession,
  AuthoringSessionRepository,
} from '../../application/authoring/authoringSessionRepository'
import type { ClipboardPort } from '../../application/authoring/clipboardPort'
import type {
  AuthoringSpec,
  Draft,
} from '../../domain/authoring/authoringContracts'
import type { AgentDraftValidationError } from '../../domain/authoring/agentDraftExchange'
import { validateAuthoringSpec } from '../../domain/authoring/authoringContracts'

interface AuthoringPreviewScreenProps {
  readonly gatewayClient: AuthoringGatewayClient
  readonly onBack: () => void
  readonly sessionRepository?: AuthoringSessionRepository
  readonly clipboardPort?: ClipboardPort
}

const INITIAL_SPEC: AuthoringSpec = {
  premise: '',
  genre: '懸疑',
  titleHint: '',
  instructions: '',
  requestedChapterCount: 3,
}

type SuccessfulDraftResult = Extract<
  AuthoringGatewayClientResult,
  { readonly ok: true }
>

type DraftPreviewResult = SuccessfulDraftResult & {
  readonly source: 'gateway' | 'agent-import' | 'restored-session'
}

type ClipboardStatus = 'copying' | 'copied' | 'failed'

function hasMeaningfulSession(
  spec: AuthoringSpec,
  agentPrompt: string | undefined,
  draft: Draft | undefined,
): boolean {
  return (
    spec.premise.trim().length > 0 ||
    spec.genre !== INITIAL_SPEC.genre ||
    Boolean(spec.titleHint?.trim()) ||
    Boolean(spec.instructions?.trim()) ||
    spec.requestedChapterCount !== INITIAL_SPEC.requestedChapterCount ||
    Boolean(agentPrompt) ||
    Boolean(draft)
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

export function AuthoringPreviewScreen({
  gatewayClient,
  onBack,
  sessionRepository,
  clipboardPort,
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
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [importErrors, setImportErrors] = useState<
    readonly AgentDraftValidationError[]
  >([])
  const [rawAgentDraft, setRawAgentDraft] = useState('')
  const [clipboardStatus, setClipboardStatus] = useState<ClipboardStatus>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!sessionRepository) {
      return
    }

    if (!hasMeaningfulSession(spec, agentPrompt, result?.draft)) {
      sessionRepository.clear()
      return
    }

    sessionRepository.save({
      spec,
      agentPrompt,
      draft: result?.draft,
    })
  }, [agentPrompt, result, sessionRepository, spec])

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
    setErrorMessage(undefined)
    setImportErrors([])
  }

  const handleCopyPrompt = async () => {
    if (!agentPrompt) {
      return
    }

    setClipboardStatus('copying')
    try {
      if (!clipboardPort) {
        throw new Error('Clipboard capability unavailable.')
      }
      await clipboardPort.writeText(agentPrompt)
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
  }

  const handleClearSession = () => {
    sessionRepository?.clear()
    setSpec(INITIAL_SPEC)
    setAgentPrompt(undefined)
    setResult(undefined)
    setErrorMessage(undefined)
    setImportErrors([])
    setRawAgentDraft('')
    setClipboardStatus(undefined)
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
        並預覽尚未發佈的草稿與品質檢查結果。
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
              onClick={handleCopyPrompt}
              type="button"
            >
              Copy Agent Prompt
            </button>
            {clipboardStatus === 'copied' && (
              <p className="authoring-copy-status" role="status">
                Prompt copied.
              </p>
            )}
            {clipboardStatus === 'failed' && (
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

      {result && (
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
                品質檢查：{result.draft.quality.status}
              </p>
              <p className="authoring-quality-status">
                驗證狀態：
                {result.draft.quality.hardFailures.length === 0 ? 'PASS' : 'FAIL'}
              </p>
            </div>
          </div>

          <h2 id="draft-preview-heading">{result.draft.title}</h2>
          <p className="authoring-category">
            分類：{result.draft.categoryLabel}
          </p>

          <section aria-labelledby="hard-failures-heading">
            <h3 id="hard-failures-heading">HARD_VALIDATION_FAILURE</h3>
            {result.draft.quality.hardFailures.length === 0 ? (
              <p>沒有硬性驗證失敗。</p>
            ) : (
              <ul>
                {result.draft.quality.hardFailures.map((issue) => (
                  <li key={`${issue.code}-${issue.chapterSequence ?? 'draft'}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="quality-warnings-heading">
            <h3 id="quality-warnings-heading">QUALITY_WARNING</h3>
            {result.draft.quality.warnings.length === 0 ? (
              <p>沒有品質警告。</p>
            ) : (
              <ul>
                {result.draft.quality.warnings.map((issue) => (
                  <li key={`${issue.code}-${issue.chapterSequence ?? 'draft'}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <h3>草稿章節</h3>
          <ol className="draft-chapter-list">
            {result.draft.chapters.map((chapter) => (
              <li key={chapter.sequence}>
                <h4>
                  第 {chapter.sequence} 章：{chapter.title}
                </h4>
                {chapter.prose.map((paragraph, paragraphIndex) => (
                  <p key={`${chapter.sequence}-${paragraphIndex}`}>
                    {paragraph}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  )
}
