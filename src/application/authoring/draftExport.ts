import type { GeneratedDraft } from '../../domain/authoring/authoringContracts'
import type { AgentDraftExchange } from '../../domain/authoring/agentDraftExchange'

export function mapGeneratedDraftToAgentDraftExchange(
  draft: GeneratedDraft,
): AgentDraftExchange {
  return {
    title: draft.title,
    genre: draft.categoryLabel,
    chapters: draft.chapters.map((chapter, index) => ({
      sequence: index + 1,
      title: chapter.title,
      prose: chapter.prose.join('\n\n'),
    })),
  }
}

export function exportDraftJson(draft: GeneratedDraft): string {
  return JSON.stringify(mapGeneratedDraftToAgentDraftExchange(draft), null, 2)
}
