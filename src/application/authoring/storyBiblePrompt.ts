import type { StoryBibleV1 } from '../../domain/authoring/storyBible'

function linesFor(
  values: readonly string[],
): readonly string[] {
  return values.length > 0 ? values.map((value) => `- ${value.trim()}`) : ['- (empty)']
}

export function buildStoryBiblePromptSection(storyBible: StoryBibleV1): string[] {
  return [
    'STORY BIBLE — CHARACTERS',
    ...(storyBible.characters.length > 0
      ? storyBible.characters.map(
          (character) => `- ${character.name.trim()}: ${character.notes.trim()}`,
        )
      : ['- (empty)']),
    '',
    'STORY BIBLE — WORLD RULES',
    ...linesFor(storyBible.worldRules),
    '',
    'STORY BIBLE — OPEN THREADS',
    ...linesFor(storyBible.openThreads),
    '',
    'STORY BIBLE — STYLE NOTES',
    ...linesFor(storyBible.styleNotes),
  ]
}
