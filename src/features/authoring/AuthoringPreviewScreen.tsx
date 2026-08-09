import { useState, type FormEvent } from 'react'
import type {
  AuthoringGatewayClient,
  AuthoringGatewayClientResult,
} from '../../application/authoring/authoringGatewayClient'
import type { AuthoringSpec } from '../../domain/authoring/authoringContracts'

interface AuthoringPreviewScreenProps {
  readonly gatewayClient: AuthoringGatewayClient
  readonly onBack: () => void
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

export function AuthoringPreviewScreen({
  gatewayClient,
  onBack,
}: AuthoringPreviewScreenProps) {
  const [spec, setSpec] = useState<AuthoringSpec>(INITIAL_SPEC)
  const [result, setResult] = useState<SuccessfulDraftResult | undefined>()
  const [errorMessage, setErrorMessage] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsSubmitting(true)
    setErrorMessage(undefined)
    setResult(undefined)

    try {
      const nextResult = await gatewayClient.generateDraft(spec)
      if (!nextResult.ok) {
        setErrorMessage(
          nextResult.errors?.map((error) => error.message).join(' ') ??
            nextResult.message,
        )
        return
      }

      setResult(nextResult)
    } catch {
      setErrorMessage('創作預覽暫時無法處理。')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="authoring-heading" className="authoring-screen">
      <div className="actions authoring-navigation">
        <button className="button-secondary" onClick={onBack} type="button">
          返回閱讀目錄
        </button>
      </div>

      <p className="eyebrow">Authoring Foundation</p>
      <h1 className="screen-heading" id="authoring-heading">
        AI 創作預覽
      </h1>
      <p className="screen-copy">
        輸入一份創作規格，預覽尚未發佈的草稿結構與品質檢查結果。
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

        <button disabled={isSubmitting} type="submit">
          {isSubmitting ? '產生中…' : '產生草稿預覽'}
        </button>
      </form>

      {errorMessage && (
        <p className="authoring-error" role="alert">
          {errorMessage}
        </p>
      )}

      {result && (
        <section aria-labelledby="draft-preview-heading" className="draft-preview">
          <div className="draft-preview-header">
            <div>
              <p className="authoring-draft-status">DRAFT / NOT PUBLISHED</p>
              <p className="authoring-provider-note">
                Provider: {result.providerName}
              </p>
            </div>
            <p className="authoring-quality-status" role="status">
              品質檢查：{result.draft.quality.status}
            </p>
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
