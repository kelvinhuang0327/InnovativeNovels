import type {
  Draft,
  GeneratedDraft,
} from '../../domain/authoring/authoringContracts'
import {
  type AgentDraftExchange,
  parseAgentDraftExchange,
  type AgentDraftExchangeParseResult,
  type AgentDraftValidationError,
} from '../../domain/authoring/agentDraftExchange'
import {
  evaluateDraftQuality,
  type DraftQualityResult,
} from '../../domain/authoring/qualityEvaluator'

export type AgentDraftImportResult =
  | {
      readonly ok: true
      readonly exchange: AgentDraftExchange
      readonly draft: Draft
      readonly quality: DraftQualityResult
    }
  | {
      readonly ok: false
      readonly errors: readonly AgentDraftValidationError[]
    }

function proseToParagraphs(prose: string): readonly string[] {
  return prose
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
}

export function mapAgentDraftExchangeToGeneratedDraft(
  exchange: AgentDraftExchange,
): GeneratedDraft {
  return {
    title: exchange.title,
    categoryLabel: exchange.genre,
    chapters: exchange.chapters.map((chapter) => ({
      sequence: chapter.sequence,
      title: chapter.title,
      prose: proseToParagraphs(chapter.prose),
    })),
  }
}

export function importAgentDraft(raw: string): AgentDraftImportResult {
  const parsed: AgentDraftExchangeParseResult = parseAgentDraftExchange(raw)
  if (!parsed.ok) {
    return parsed
  }

  const generated = mapAgentDraftExchangeToGeneratedDraft(parsed.exchange)
  const quality = evaluateDraftQuality(generated)
  const draft: Draft = {
    ...generated,
    status: 'DRAFT',
    quality,
  }

  return {
    ok: true,
    exchange: parsed.exchange,
    draft,
    quality,
  }
}
