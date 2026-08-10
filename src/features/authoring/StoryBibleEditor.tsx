import { useState, type FormEvent } from 'react'
import {
  addStoryBibleCharacter,
  addStoryBibleTextItem,
  removeStoryBibleCharacter,
  removeStoryBibleTextItem,
  STORY_BIBLE_LIMITS,
  updateStoryBibleCharacter,
  updateStoryBibleTextItem,
  type StoryBibleSection,
  type StoryBibleV1,
} from '../../domain/authoring/storyBible'

interface StoryBibleEditorProps {
  readonly storyBible: StoryBibleV1
  readonly onChange: (storyBible: StoryBibleV1) => void
}

type ListSection = Exclude<StoryBibleSection, 'characters'>

const LIST_SECTIONS: readonly {
  readonly section: ListSection
  readonly title: string
  readonly itemLabel: string
  readonly inputLabel: string
}[] = [
  {
    section: 'worldRules',
    title: 'World Rules',
    itemLabel: 'world rule',
    inputLabel: 'World rule text',
  },
  {
    section: 'openThreads',
    title: 'Open Threads',
    itemLabel: 'open thread',
    inputLabel: 'Open thread text',
  },
  {
    section: 'styleNotes',
    title: 'Style Notes',
    itemLabel: 'style note',
    inputLabel: 'Style note text',
  },
]

export function StoryBibleEditor({
  storyBible,
  onChange,
}: StoryBibleEditorProps) {
  const [characterName, setCharacterName] = useState('')
  const [characterNotes, setCharacterNotes] = useState('')
  const [newItems, setNewItems] = useState<Record<ListSection, string>>({
    worldRules: '',
    openThreads: '',
    styleNotes: '',
  })
  const [errorMessage, setErrorMessage] = useState<string | undefined>()

  const applyEdit = (
    result: ReturnType<typeof addStoryBibleCharacter>,
  ): boolean => {
    if (!result.ok) {
      setErrorMessage(result.message)
      return false
    }
    onChange(result.storyBible)
    setErrorMessage(undefined)
    return true
  }

  const handleAddCharacter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      applyEdit(
        addStoryBibleCharacter(storyBible, characterName, characterNotes),
      )
    ) {
      setCharacterName('')
      setCharacterNotes('')
    }
  }

  const handleAddItem = (
    event: FormEvent<HTMLFormElement>,
    section: ListSection,
  ) => {
    event.preventDefault()
    if (applyEdit(addStoryBibleTextItem(storyBible, section, newItems[section]))) {
      setNewItems((current) => ({ ...current, [section]: '' }))
    }
  }

  const handleCharacterChange = (
    index: number,
    patch: { readonly name?: string; readonly notes?: string },
  ) => {
    applyEdit(updateStoryBibleCharacter(storyBible, index, patch))
  }

  const handleItemChange = (
    section: ListSection,
    index: number,
    value: string,
  ) => {
    applyEdit(updateStoryBibleTextItem(storyBible, section, index, value))
  }

  return (
    <section aria-labelledby="story-bible-heading" className="agent-exchange-panel story-bible-panel">
      <div>
        <h2 id="story-bible-heading">Story Bible</h2>
        <p>
          只保存本次 Authoring Session 的人工 canon 筆記；不會成為 Draft 正文或 production metadata。
        </p>
      </div>

      {errorMessage && (
        <p className="authoring-error" role="alert">
          {errorMessage}
        </p>
      )}

      <section aria-labelledby="story-bible-characters-heading" className="story-bible-section">
        <div className="draft-section-heading">
          <h3 id="story-bible-characters-heading">Characters</h3>
          <span>{storyBible.characters.length}/{STORY_BIBLE_LIMITS.characters}</span>
        </div>
        <form className="story-bible-add-form" onSubmit={handleAddCharacter}>
          <label className="authoring-field" htmlFor="story-bible-new-character-name">
            Character name
            <input
              aria-label="New Character name"
              id="story-bible-new-character-name"
              onChange={(event) => setCharacterName(event.target.value)}
              value={characterName}
            />
          </label>
          <label className="authoring-field" htmlFor="story-bible-new-character-notes">
            Character notes
            <textarea
              aria-label="New Character notes"
              id="story-bible-new-character-notes"
              onChange={(event) => setCharacterNotes(event.target.value)}
              value={characterNotes}
            />
          </label>
          <button
            disabled={storyBible.characters.length >= STORY_BIBLE_LIMITS.characters}
            type="submit"
          >
            Add Character
          </button>
        </form>
        {storyBible.characters.length >= STORY_BIBLE_LIMITS.characters && (
          <p className="authoring-quality-status" role="status">
            Characters 已達上限，請先移除既有項目。
          </p>
        )}
        {storyBible.characters.length > 0 && (
          <ul className="story-bible-list">
            {storyBible.characters.map((character, index) => (
              <li className="story-bible-item" key={`${character.name}-${index}`}>
                <label className="authoring-field" htmlFor={`story-bible-character-name-${index}`}>
                  Character name
                  <input
                    id={`story-bible-character-name-${index}`}
                    onChange={(event) =>
                      handleCharacterChange(index, { name: event.target.value })
                    }
                    value={character.name}
                  />
                </label>
                <label className="authoring-field" htmlFor={`story-bible-character-notes-${index}`}>
                  Character notes
                  <textarea
                    id={`story-bible-character-notes-${index}`}
                    onChange={(event) =>
                      handleCharacterChange(index, { notes: event.target.value })
                    }
                    value={character.notes}
                  />
                </label>
                <button
                  aria-label={`Remove character ${index + 1}`}
                  onClick={() => onChange(removeStoryBibleCharacter(storyBible, index))}
                  type="button"
                >
                  Remove Character
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {LIST_SECTIONS.map(({ section, title, itemLabel, inputLabel }) => {
        const items = storyBible[section]
        const limit = STORY_BIBLE_LIMITS[section]
        return (
          <section
            aria-labelledby={`story-bible-${section}-heading`}
            className="story-bible-section"
            key={section}
          >
            <div className="draft-section-heading">
              <h3 id={`story-bible-${section}-heading`}>{title}</h3>
              <span>{items.length}/{limit}</span>
            </div>
            <form
              className="story-bible-add-form"
              onSubmit={(event) => handleAddItem(event, section)}
            >
              <label className="authoring-field" htmlFor={`story-bible-new-${section}`}>
                {inputLabel}
                <input
                  aria-label={`New ${inputLabel}`}
                  id={`story-bible-new-${section}`}
                  onChange={(event) =>
                    setNewItems((current) => ({
                      ...current,
                      [section]: event.target.value,
                    }))
                  }
                  value={newItems[section]}
                />
              </label>
              <button disabled={items.length >= limit} type="submit">
                Add {itemLabel}
              </button>
            </form>
            {items.length >= limit && (
              <p className="authoring-quality-status" role="status">
                {title} 已達上限，請先移除既有項目。
              </p>
            )}
            {items.length > 0 && (
              <ul className="story-bible-list">
                {items.map((item, index) => (
                  <li className="story-bible-item story-bible-text-item" key={`${section}-${index}`}>
                    <label className="authoring-field" htmlFor={`story-bible-${section}-${index}`}>
                      {inputLabel}
                      <input
                        id={`story-bible-${section}-${index}`}
                        onChange={(event) =>
                          handleItemChange(section, index, event.target.value)
                        }
                        value={item}
                      />
                    </label>
                    <button
                      aria-label={`Remove ${itemLabel} ${index + 1}`}
                      onClick={() => onChange(removeStoryBibleTextItem(storyBible, section, index))}
                      type="button"
                    >
                      Remove {itemLabel}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </section>
  )
}
