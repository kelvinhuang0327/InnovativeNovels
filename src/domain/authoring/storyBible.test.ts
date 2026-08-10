import { describe, expect, it } from 'vitest'
import {
  addStoryBibleCharacter,
  addStoryBibleTextItem,
  createEmptyStoryBible,
  removeStoryBibleCharacter,
  removeStoryBibleTextItem,
  STORY_BIBLE_LIMITS,
  updateStoryBibleCharacter,
  updateStoryBibleTextItem,
  validateStoryBible,
} from './storyBible'

describe('Story Bible V1', () => {
  it('requires trimmed character fields and non-empty list items', () => {
    const storyBible = {
      ...createEmptyStoryBible(),
      characters: [{ name: '  ', notes: '  ' }],
      worldRules: ['  '],
      openThreads: ['找到鐘'],
      styleNotes: ['克制'],
    }

    expect(validateStoryBible(storyBible).map((error) => error.code)).toEqual([
      'CHARACTER_NAME_REQUIRED',
      'CHARACTER_NOTES_REQUIRED',
      'WORLD_RULE_REQUIRED',
    ])
  })

  it('enforces each bounded section without truncating stored items', () => {
    const characters = Array.from({ length: STORY_BIBLE_LIMITS.characters }, (_, index) => ({
      name: `角色 ${index + 1}`,
      notes: '備註',
    }))
    const bible = { ...createEmptyStoryBible(), characters }
    const atLimit = addStoryBibleCharacter(bible, '超過上限', '不應加入')

    expect(atLimit).toMatchObject({ ok: false })
    expect(bible.characters).toHaveLength(STORY_BIBLE_LIMITS.characters)
    expect(
      addStoryBibleTextItem(
        {
          ...createEmptyStoryBible(),
          styleNotes: Array.from({ length: STORY_BIBLE_LIMITS.styleNotes }, () => '筆記'),
        },
        'styleNotes',
        '超過上限',
      ),
    ).toMatchObject({ ok: false })
  })

  it('supports character and ordered text CRUD', () => {
    const createdCharacter = addStoryBibleCharacter(
      createEmptyStoryBible(),
      '林澄',
      '持有黃銅片。',
    )
    expect(createdCharacter.ok).toBe(true)
    if (!createdCharacter.ok) return

    const updatedCharacter = updateStoryBibleCharacter(
      createdCharacter.storyBible,
      0,
      { notes: '追查潮汐裝置。' },
    )
    expect(updatedCharacter).toMatchObject({
      ok: true,
      storyBible: { characters: [{ name: '林澄', notes: '追查潮汐裝置。' }] },
    })
    if (!updatedCharacter.ok) return

    const withRule = addStoryBibleTextItem(
      updatedCharacter.storyBible,
      'worldRules',
      '潮汐裝置會記錄沒有被選中的未來。',
    )
    expect(withRule).toMatchObject({ ok: true })
    if (!withRule.ok) return

    const withThread = addStoryBibleTextItem(
      withRule.storyBible,
      'openThreads',
      '下一次低潮前找到第一座鐘。',
    )
    expect(withThread).toMatchObject({ ok: true })
    if (!withThread.ok) return

    const edited = updateStoryBibleTextItem(
      withThread.storyBible,
      'openThreads',
      0,
      '確認第二個聲音是誰。',
    )
    expect(edited).toMatchObject({
      ok: true,
      storyBible: { openThreads: ['確認第二個聲音是誰。'] },
    })
    if (!edited.ok) return

    expect(removeStoryBibleTextItem(edited.storyBible, 'worldRules', 0).worldRules).toEqual([])
    expect(removeStoryBibleCharacter(edited.storyBible, 0).characters).toEqual([])
  })
})
