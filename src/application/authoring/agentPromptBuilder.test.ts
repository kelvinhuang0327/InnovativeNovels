import { describe, expect, it } from 'vitest'
import type { StoryBibleV1 } from '../../domain/authoring/storyBible'
import { buildAgentPrompt } from './agentPromptBuilder'

const spec = {
  premise: '一名守夜人發現城市的鐘每天少響一聲。',
  genre: '科幻懸疑',
  titleHint: '潮汐檔案',
  instructions: '使用克制的節奏，讓每章都留下可追查的線索。',
  requestedChapterCount: 3,
}

describe('Agent Prompt Builder', () => {
  it('includes the Authoring Spec, writing requirements, and strict exchange contract', () => {
    const prompt = buildAgentPrompt(spec)

    expect(prompt).toContain('Role: Novel Generation Agent')
    expect(prompt).toContain(spec.premise)
    expect(prompt).toContain(spec.genre)
    expect(prompt).toContain(spec.titleHint)
    expect(prompt).toContain(spec.instructions)
    expect(prompt).toContain('"title"')
    expect(prompt).toContain('"genre"')
    expect(prompt).toContain('"chapters"')
    expect(prompt).toContain('"sequence"')
    expect(prompt).toContain('"prose"')
    expect(prompt).toContain('raw JSON only')
    expect(prompt).toContain('Final self-check')
  })

  it('does not require or name a specific model/provider', () => {
    const prompt = buildAgentPrompt(spec)

    expect(prompt).not.toMatch(/OpenAI|Anthropic|Claude|Gemini|Qwen|Luna|ChatGPT/i)
    expect(prompt).not.toMatch(/provider/i)
  })

  it('is deterministic for identical input', () => {
    expect(buildAgentPrompt(spec)).toBe(buildAgentPrompt(spec))
  })

  it('reuses the bounded Story Bible sections without changing the response contract', () => {
    const storyBible: StoryBibleV1 = {
      characters: [{ name: '林澄', notes: '追查潮汐裝置。' }],
      worldRules: ['潮汐裝置會記錄沒有被選中的未來。'],
      openThreads: ['下一次低潮前找到第一座鐘。'],
      styleNotes: ['維持克制的科幻懸疑氛圍。'],
    }
    const prompt = buildAgentPrompt(spec, storyBible)

    expect(prompt).toContain('STORY BIBLE — CHARACTERS')
    expect(prompt).toContain('- 林澄: 追查潮汐裝置。')
    expect(prompt).toContain('STORY BIBLE — WORLD RULES')
    expect(prompt).toContain('STORY BIBLE — OPEN THREADS')
    expect(prompt).toContain('STORY BIBLE — STYLE NOTES')
    expect(prompt).toContain('Use only the fields title, genre, and chapters at the root')
    expect(prompt).not.toContain('storyBible')
  })
})
