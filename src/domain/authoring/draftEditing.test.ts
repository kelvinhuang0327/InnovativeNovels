import { describe, expect, it } from 'vitest'
import type { GeneratedDraft } from './authoringContracts'
import {
  addDraftChapter,
  moveDraftChapter,
  normalizeDraftSequences,
  removeDraftChapter,
  updateDraftChapter,
  updateDraftMetadata,
} from './draftEditing'

const draft: GeneratedDraft = {
  title: '原標題',
  categoryLabel: '原分類',
  chapters: [
    { sequence: 1, title: '一', prose: ['甲'] },
    { sequence: 2, title: '二', prose: ['乙'] },
    { sequence: 3, title: '三', prose: ['丙'] },
  ],
}

describe('draft editing operations', () => {
  it('updates book metadata and one chapter without recreating other chapters', () => {
    const edited = updateDraftChapter(
      updateDraftMetadata(draft, { title: '新標題', categoryLabel: '新分類' }),
      2,
      { title: '改過的二', prose: ['新的乙'] },
    )

    expect(edited.title).toBe('新標題')
    expect(edited.categoryLabel).toBe('新分類')
    expect(edited.chapters).toEqual([
      draft.chapters[0],
      { sequence: 2, title: '改過的二', prose: ['新的乙'] },
      draft.chapters[2],
    ])
  })

  it('adds and removes chapters while normalizing sequences', () => {
    const withNewChapter = addDraftChapter(draft)
    expect(withNewChapter.chapters).toHaveLength(4)
    expect(withNewChapter.chapters[3]).toEqual({
      sequence: 4,
      title: '',
      prose: [''],
    })

    const removed = removeDraftChapter(withNewChapter, 2)
    expect(removed.chapters.map((chapter) => chapter.sequence)).toEqual([1, 2, 3])
    expect(removed.chapters.map((chapter) => chapter.title)).toEqual(['一', '三', ''])
  })

  it('moves chapters up and down without losing their content', () => {
    const movedUp = moveDraftChapter(draft, 3, 'up')
    expect(movedUp.chapters.map((chapter) => chapter.title)).toEqual(['一', '三', '二'])
    expect(movedUp.chapters.map((chapter) => chapter.sequence)).toEqual([1, 2, 3])

    const movedDown = moveDraftChapter(movedUp, 1, 'down')
    expect(movedDown.chapters.map((chapter) => chapter.title)).toEqual(['三', '一', '二'])
    expect(movedDown.chapters[0]?.prose).toEqual(['丙'])
  })

  it('normalizes arbitrary visible sequences deterministically', () => {
    expect(
      normalizeDraftSequences([
        { sequence: 9, title: 'a', prose: ['a'] },
        { sequence: 9, title: 'b', prose: ['b'] },
      ]),
    ).toEqual([
      { sequence: 1, title: 'a', prose: ['a'] },
      { sequence: 2, title: 'b', prose: ['b'] },
    ])
  })
})
