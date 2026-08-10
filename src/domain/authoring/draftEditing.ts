import type { DraftChapter, GeneratedDraft } from './authoringContracts'

export interface DraftChapterPatch {
  readonly title?: string
  readonly prose?: readonly string[]
}

export function normalizeDraftSequences(
  chapters: readonly DraftChapter[],
): readonly DraftChapter[] {
  return chapters.map((chapter, index) => ({
    ...chapter,
    sequence: index + 1,
  }))
}

function withChapters(
  draft: GeneratedDraft,
  chapters: readonly DraftChapter[],
): GeneratedDraft {
  return {
    ...draft,
    chapters: normalizeDraftSequences(chapters),
  }
}

export function updateDraftMetadata(
  draft: GeneratedDraft,
  patch: Partial<Pick<GeneratedDraft, 'title' | 'categoryLabel'>>,
): GeneratedDraft {
  return { ...draft, ...patch }
}

export function updateDraftChapter(
  draft: GeneratedDraft,
  sequence: number,
  patch: DraftChapterPatch,
): GeneratedDraft {
  const chapters = draft.chapters.map((chapter) =>
    chapter.sequence === sequence ? { ...chapter, ...patch } : chapter,
  )
  return withChapters(draft, chapters)
}

export function addDraftChapter(
  draft: GeneratedDraft,
  chapter: DraftChapter = { sequence: draft.chapters.length + 1, title: '', prose: [''] },
): GeneratedDraft {
  return withChapters(draft, [...draft.chapters, chapter])
}

export function removeDraftChapter(
  draft: GeneratedDraft,
  sequence: number,
): GeneratedDraft {
  return withChapters(
    draft,
    draft.chapters.filter((chapter) => chapter.sequence !== sequence),
  )
}

export function moveDraftChapter(
  draft: GeneratedDraft,
  sequence: number,
  direction: 'up' | 'down',
): GeneratedDraft {
  const index = draft.chapters.findIndex(
    (chapter) => chapter.sequence === sequence,
  )
  if (index < 0) {
    return draft
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= draft.chapters.length) {
    return draft
  }

  const chapters = [...draft.chapters]
  const [chapter] = chapters.splice(index, 1)
  chapters.splice(targetIndex, 0, chapter)
  return withChapters(draft, chapters)
}
