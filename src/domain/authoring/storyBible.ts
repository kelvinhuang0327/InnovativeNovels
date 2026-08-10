export const STORY_BIBLE_LIMITS = {
  characters: 20,
  worldRules: 20,
  openThreads: 20,
  styleNotes: 10,
} as const

export interface StoryBibleCharacter {
  readonly name: string
  readonly notes: string
}

export interface StoryBibleV1 {
  readonly characters: readonly StoryBibleCharacter[]
  readonly worldRules: readonly string[]
  readonly openThreads: readonly string[]
  readonly styleNotes: readonly string[]
}

export type StoryBibleSection = keyof StoryBibleV1

export interface StoryBibleValidationError {
  readonly code:
    | 'CHARACTER_NAME_REQUIRED'
    | 'CHARACTER_NOTES_REQUIRED'
    | 'WORLD_RULE_REQUIRED'
    | 'OPEN_THREAD_REQUIRED'
    | 'STYLE_NOTE_REQUIRED'
    | 'CHARACTER_LIMIT_REACHED'
    | 'WORLD_RULE_LIMIT_REACHED'
    | 'OPEN_THREAD_LIMIT_REACHED'
    | 'STYLE_NOTE_LIMIT_REACHED'
  readonly section: StoryBibleSection
  readonly index?: number
  readonly message: string
}

export type StoryBibleEditResult =
  | { readonly ok: true; readonly storyBible: StoryBibleV1 }
  | { readonly ok: false; readonly message: string }

export function createEmptyStoryBible(): StoryBibleV1 {
  return {
    characters: [],
    worldRules: [],
    openThreads: [],
    styleNotes: [],
  }
}

export const EMPTY_STORY_BIBLE = createEmptyStoryBible()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOnlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return Object.keys(value).every((field) => fields.includes(field))
}

export function parseStoryBible(value: unknown): StoryBibleV1 | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyFields(value, ['characters', 'worldRules', 'openThreads', 'styleNotes']) ||
    !Array.isArray(value.characters) ||
    !Array.isArray(value.worldRules) ||
    !Array.isArray(value.openThreads) ||
    !Array.isArray(value.styleNotes)
  ) {
    return undefined
  }

  const characters = value.characters.map((character) => {
    if (
      !isRecord(character) ||
      !hasOnlyFields(character, ['name', 'notes']) ||
      typeof character.name !== 'string' ||
      typeof character.notes !== 'string'
    ) {
      return undefined
    }
    return { name: character.name, notes: character.notes }
  })
  const worldRules = value.worldRules.map((item) =>
    typeof item === 'string' ? item : undefined,
  )
  const openThreads = value.openThreads.map((item) =>
    typeof item === 'string' ? item : undefined,
  )
  const styleNotes = value.styleNotes.map((item) =>
    typeof item === 'string' ? item : undefined,
  )

  if (
    characters.some((character) => character === undefined) ||
    worldRules.some((item) => item === undefined) ||
    openThreads.some((item) => item === undefined) ||
    styleNotes.some((item) => item === undefined)
  ) {
    return undefined
  }

  const storyBible: StoryBibleV1 = {
    characters: characters as StoryBibleCharacter[],
    worldRules: worldRules as string[],
    openThreads: openThreads as string[],
    styleNotes: styleNotes as string[],
  }
  return validateStoryBible(storyBible).length === 0 ? storyBible : undefined
}

function requiredError(
  section: StoryBibleSection,
  code: StoryBibleValidationError['code'],
  message: string,
  index?: number,
): StoryBibleValidationError {
  return { code, section, index, message }
}

export function validateStoryBible(
  storyBible: StoryBibleV1,
): readonly StoryBibleValidationError[] {
  const errors: StoryBibleValidationError[] = []

  if (storyBible.characters.length > STORY_BIBLE_LIMITS.characters) {
    errors.push({
      code: 'CHARACTER_LIMIT_REACHED',
      section: 'characters',
      message: `角色最多只能有 ${STORY_BIBLE_LIMITS.characters} 個。`,
    })
  }
  storyBible.characters.forEach((character, index) => {
    if (character.name.trim().length === 0) {
      errors.push(
        requiredError('characters', 'CHARACTER_NAME_REQUIRED', '角色名稱不可為空。', index),
      )
    }
    if (character.notes.trim().length === 0) {
      errors.push(
        requiredError('characters', 'CHARACTER_NOTES_REQUIRED', '角色備註不可為空。', index),
      )
    }
  })

  const listSections: readonly {
    readonly section: Exclude<StoryBibleSection, 'characters'>
    readonly values: readonly string[]
    readonly limit: number
    readonly limitCode: StoryBibleValidationError['code']
    readonly requiredCode: StoryBibleValidationError['code']
    readonly requiredMessage: string
    readonly label: string
  }[] = [
    {
      section: 'worldRules',
      values: storyBible.worldRules,
      limit: STORY_BIBLE_LIMITS.worldRules,
      limitCode: 'WORLD_RULE_LIMIT_REACHED',
      requiredCode: 'WORLD_RULE_REQUIRED',
      requiredMessage: '世界規則不可為空。',
      label: '世界規則',
    },
    {
      section: 'openThreads',
      values: storyBible.openThreads,
      limit: STORY_BIBLE_LIMITS.openThreads,
      limitCode: 'OPEN_THREAD_LIMIT_REACHED',
      requiredCode: 'OPEN_THREAD_REQUIRED',
      requiredMessage: '待解決線索不可為空。',
      label: '待解決線索',
    },
    {
      section: 'styleNotes',
      values: storyBible.styleNotes,
      limit: STORY_BIBLE_LIMITS.styleNotes,
      limitCode: 'STYLE_NOTE_LIMIT_REACHED',
      requiredCode: 'STYLE_NOTE_REQUIRED',
      requiredMessage: '風格筆記不可為空。',
      label: '風格筆記',
    },
  ]

  for (const list of listSections) {
    if (list.values.length > list.limit) {
      errors.push({
        code: list.limitCode,
        section: list.section,
        message: `${list.label}最多只能有 ${list.limit} 項。`,
      })
    }
    list.values.forEach((value, index) => {
      if (value.trim().length === 0) {
        errors.push(
          requiredError(list.section, list.requiredCode, list.requiredMessage, index),
        )
      }
    })
  }

  return errors
}

function success(storyBible: StoryBibleV1): StoryBibleEditResult {
  return { ok: true, storyBible }
}

function failure(message: string): StoryBibleEditResult {
  return { ok: false, message }
}

function validateCharacterInput(name: string, notes: string): string | undefined {
  if (name.trim().length === 0) {
    return '角色名稱不可為空。'
  }
  if (notes.trim().length === 0) {
    return '角色備註不可為空。'
  }
  return undefined
}

function validateListInput(value: string, label: string): string | undefined {
  return value.trim().length === 0 ? `${label}不可為空。` : undefined
}

export function addStoryBibleCharacter(
  storyBible: StoryBibleV1,
  name: string,
  notes: string,
): StoryBibleEditResult {
  const inputError = validateCharacterInput(name, notes)
  if (inputError) {
    return failure(inputError)
  }
  if (storyBible.characters.length >= STORY_BIBLE_LIMITS.characters) {
    return failure(`角色最多只能有 ${STORY_BIBLE_LIMITS.characters} 個。`)
  }
  return success({
    ...storyBible,
    characters: [...storyBible.characters, { name: name.trim(), notes: notes.trim() }],
  })
}

export function updateStoryBibleCharacter(
  storyBible: StoryBibleV1,
  index: number,
  patch: Partial<StoryBibleCharacter>,
): StoryBibleEditResult {
  const current = storyBible.characters[index]
  if (!current) {
    return failure('找不到要編輯的角色。')
  }
  const next = { ...current, ...patch }
  const inputError = validateCharacterInput(next.name, next.notes)
  if (inputError) {
    return failure(inputError)
  }
  return success({
    ...storyBible,
    characters: storyBible.characters.map((character, characterIndex) =>
      characterIndex === index
        ? { name: next.name.trim(), notes: next.notes.trim() }
        : character,
    ),
  })
}

export function removeStoryBibleCharacter(
  storyBible: StoryBibleV1,
  index: number,
): StoryBibleV1 {
  return {
    ...storyBible,
    characters: storyBible.characters.filter((_, characterIndex) => characterIndex !== index),
  }
}

export function addStoryBibleTextItem(
  storyBible: StoryBibleV1,
  section: Exclude<StoryBibleSection, 'characters'>,
  value: string,
): StoryBibleEditResult {
  const labels = {
    worldRules: '世界規則',
    openThreads: '待解決線索',
    styleNotes: '風格筆記',
  } as const
  const inputError = validateListInput(value, labels[section])
  if (inputError) {
    return failure(inputError)
  }
  if (storyBible[section].length >= STORY_BIBLE_LIMITS[section]) {
    return failure(`${labels[section]}最多只能有 ${STORY_BIBLE_LIMITS[section]} 項。`)
  }
  return success({
    ...storyBible,
    [section]: [...storyBible[section], value.trim()],
  })
}

export function updateStoryBibleTextItem(
  storyBible: StoryBibleV1,
  section: Exclude<StoryBibleSection, 'characters'>,
  index: number,
  value: string,
): StoryBibleEditResult {
  const labels = {
    worldRules: '世界規則',
    openThreads: '待解決線索',
    styleNotes: '風格筆記',
  } as const
  if (storyBible[section][index] === undefined) {
    return failure(`找不到要編輯的${labels[section]}。`)
  }
  const inputError = validateListInput(value, labels[section])
  if (inputError) {
    return failure(inputError)
  }
  return success({
    ...storyBible,
    [section]: storyBible[section].map((item, itemIndex) =>
      itemIndex === index ? value.trim() : item,
    ),
  })
}

export function removeStoryBibleTextItem(
  storyBible: StoryBibleV1,
  section: Exclude<StoryBibleSection, 'characters'>,
  index: number,
): StoryBibleV1 {
  return {
    ...storyBible,
    [section]: storyBible[section].filter((_, itemIndex) => itemIndex !== index),
  }
}

export function hasStoryBibleContent(storyBible: StoryBibleV1): boolean {
  return (
    storyBible.characters.length > 0 ||
    storyBible.worldRules.length > 0 ||
    storyBible.openThreads.length > 0 ||
    storyBible.styleNotes.length > 0
  )
}
